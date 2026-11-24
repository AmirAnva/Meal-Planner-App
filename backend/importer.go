package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"
)

// RecipeParser defines the interface for importing a recipe from an external URL.
type RecipeParser interface {
	ImportRecipeFromURL(ctx context.Context, targetURL string) (*Recipe, error)
}

// OllamaImporter extracts recipe text and parses it using an Ollama LLM model (e.g. Qwen2.5:1.5b).
type OllamaImporter struct {
	OllamaURL  string
	Model      string
	HTTPClient *http.Client
}

// NewOllamaImporter initializes an importer with environment fallbacks or defaults.
func NewOllamaImporter(ollamaURL, model string, client *http.Client) *OllamaImporter {
	if ollamaURL == "" {
		ollamaURL = os.Getenv("OLLAMA_HOST")
		if ollamaURL == "" {
			ollamaURL = "http://localhost:11434"
		}
	}
	// Trim trailing slash for clean endpoint construction
	ollamaURL = strings.TrimRight(ollamaURL, "/")

	if model == "" {
		model = os.Getenv("OLLAMA_MODEL")
		if model == "" {
			model = "qwen2.5:1.5b"
		}
	}

	if client == nil {
		client = &http.Client{
			Timeout: 45 * time.Second,
		}
	}

	return &OllamaImporter{
		OllamaURL:  ollamaURL,
		Model:      model,
		HTTPClient: client,
	}
}

// ImportRecipeFromURL downloads webpage content, extracts relevant text or schema metadata,
// and invokes Qwen via Ollama to produce a structured Recipe.
func (oi *OllamaImporter) ImportRecipeFromURL(ctx context.Context, targetURL string) (*Recipe, error) {
	parsedURL, err := url.ParseRequestURI(strings.TrimSpace(targetURL))
	if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return nil, errors.New("invalid URL: must start with http:// or https://")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	// Set standard browser headers so recipe blogs do not block the request
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := oi.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch webpage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("webpage returned status %d %s", resp.StatusCode, resp.Status)
	}

	// Limit read to 2MB
	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read webpage: %w", err)
	}
	htmlContent := string(bodyBytes)

	// Step 1: Check if there's structured JSON-LD Schema.org Recipe data
	if recipe, ok := extractJSONLDRecipe(htmlContent); ok && recipe != nil && len(recipe.Ingredients) > 0 {
		return recipe, nil
	}

	// Step 2: Extract page title and clean article body for LLM parsing
	title := extractHTMLTitle(htmlContent)
	cleanContent := extractCleanText(htmlContent)
	if len(cleanContent) > 12000 {
		cleanContent = cleanContent[:12000]
	}

	if strings.TrimSpace(cleanContent) == "" {
		return nil, errors.New("could not extract text content from the provided URL")
	}

	// Step 3: Parse with Qwen via Ollama
	return oi.parseWithOllama(ctx, title, cleanContent)
}

func (oi *OllamaImporter) parseWithOllama(ctx context.Context, pageTitle, textContent string) (*Recipe, error) {
	prompt := fmt.Sprintf(`You are an expert recipe extractor. Extract the recipe from the provided text into a JSON object matching this exact format:
{
  "name": "Recipe Title",
  "ingredients": [
    "ingredient 1 with quantity",
    "ingredient 2 with quantity"
  ],
  "instructions": [
    "Step 1 instructions",
    "Step 2 instructions"
  ]
}

Guidelines:
- "name" should be the clear dish name (e.g. "%s" or the dish mentioned).
- "ingredients" must be a clean list of ingredients with quantities and units.
- "instructions" must be sequential, clear step-by-step cooking steps.
- Strip away all conversational blog filler, personal stories, advertisements, and website navigation.
- Respond ONLY with the JSON object.

Text content:
%s`, pageTitle, textContent)

	reqPayload := map[string]any{
		"model":  oi.Model,
		"prompt": prompt,
		"format": "json",
		"stream": false,
	}

	jsonBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, fmt.Errorf("marshal ollama request: %w", err)
	}

	generateURL := fmt.Sprintf("%s/api/generate", oi.OllamaURL)
	ollamaReq, err := http.NewRequestWithContext(ctx, http.MethodPost, generateURL, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, fmt.Errorf("create ollama request: %w", err)
	}
	ollamaReq.Header.Set("Content-Type", "application/json")

	ollamaResp, err := oi.HTTPClient.Do(ollamaReq)
	if err != nil {
		return nil, fmt.Errorf("could not connect to Ollama at %s. Please make sure Ollama is running ('ollama run %s'): %w", oi.OllamaURL, oi.Model, err)
	}
	defer ollamaResp.Body.Close()

	if ollamaResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(ollamaResp.Body, 1024))
		return nil, fmt.Errorf("ollama API error (status %d): %s", ollamaResp.StatusCode, strings.TrimSpace(string(body)))
	}

	var genResult struct {
		Response string `json:"response"`
		Error    string `json:"error"`
	}
	if err := json.NewDecoder(ollamaResp.Body).Decode(&genResult); err != nil {
		return nil, fmt.Errorf("decode ollama response: %w", err)
	}
	if genResult.Error != "" {
		return nil, fmt.Errorf("ollama error: %s", genResult.Error)
	}

	// Parse model JSON output into Recipe
	var draft struct {
		Name         string   `json:"name"`
		Ingredients  []string `json:"ingredients"`
		Instructions []string `json:"instructions"`
	}

	if err := json.Unmarshal([]byte(genResult.Response), &draft); err != nil {
		return nil, fmt.Errorf("failed to parse recipe JSON from model: %w", err)
	}

	name := strings.TrimSpace(draft.Name)
	if name == "" {
		name = strings.TrimSpace(pageTitle)
	}
	if name == "" {
		name = "Imported Recipe"
	}

	cleanIngredients := make([]string, 0, len(draft.Ingredients))
	for _, ing := range draft.Ingredients {
		trimmed := strings.TrimSpace(ing)
		if trimmed != "" {
			cleanIngredients = append(cleanIngredients, trimmed)
		}
	}

	cleanInstructions := make([]string, 0, len(draft.Instructions))
	for _, step := range draft.Instructions {
		trimmed := strings.TrimSpace(step)
		if trimmed != "" {
			cleanInstructions = append(cleanInstructions, trimmed)
		}
	}

	return &Recipe{
		Name:         name,
		Ingredients:  cleanIngredients,
		Instructions: cleanInstructions,
	}, nil
}

// ── HTML Extraction Helpers ───────────────────────────────────────────

var (
	titleRegex  = regexp.MustCompile(`(?i)<title[^>]*>(.*?)</title>`)
	scriptRegex = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	styleRegex  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	navRegex    = regexp.MustCompile(`(?is)<(nav|header|footer|aside)[^>]*>.*?</(nav|header|footer|aside)>`)
	tagRegex    = regexp.MustCompile(`(?is)<[^>]+>`)
	spaceRegex  = regexp.MustCompile(`[ \t\r\f]+`)
	nlRegex     = regexp.MustCompile(`\n{3,}`)
	jsonLdRegex = regexp.MustCompile(`(?is)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>`)
)

func extractHTMLTitle(rawHTML string) string {
	match := titleRegex.FindStringSubmatch(rawHTML)
	if len(match) > 1 {
		title := html.UnescapeString(strings.TrimSpace(match[1]))
		// Strip common suffix e.g. " - Allrecipes" or " | Food Network"
		for _, sep := range []string{" - ", " | ", " – ", " — "} {
			if idx := strings.Index(title, sep); idx > 0 {
				title = strings.TrimSpace(title[:idx])
			}
		}
		return title
	}
	return ""
}

func extractCleanText(rawHTML string) string {
	cleaned := scriptRegex.ReplaceAllString(rawHTML, " ")
	cleaned = styleRegex.ReplaceAllString(cleaned, " ")
	cleaned = navRegex.ReplaceAllString(cleaned, " ")
	cleaned = tagRegex.ReplaceAllString(cleaned, "\n")
	cleaned = html.UnescapeString(cleaned)

	var lines []string
	for _, line := range strings.Split(cleaned, "\n") {
		trimmed := spaceRegex.ReplaceAllString(strings.TrimSpace(line), " ")
		if trimmed != "" {
			lines = append(lines, trimmed)
		}
	}
	result := strings.Join(lines, "\n")
	return nlRegex.ReplaceAllString(result, "\n\n")
}

// extractJSONLDRecipe searches for Schema.org Recipe data in JSON-LD script tags.
func extractJSONLDRecipe(rawHTML string) (*Recipe, bool) {
	matches := jsonLdRegex.FindAllStringSubmatch(rawHTML, -1)
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		jsonContent := strings.TrimSpace(m[1])
		if !strings.Contains(jsonContent, "Recipe") {
			continue
		}

		var rawData any
		if err := json.Unmarshal([]byte(jsonContent), &rawData); err != nil {
			continue
		}

		if recipe := findRecipeInJSON(rawData); recipe != nil {
			return recipe, true
		}
	}
	return nil, false
}

func findRecipeInJSON(data any) *Recipe {
	switch v := data.(type) {
	case []any:
		for _, item := range v {
			if r := findRecipeInJSON(item); r != nil {
				return r
			}
		}
	case map[string]any:
		if typeVal, ok := v["@type"]; ok {
			var isRecipe bool
			switch t := typeVal.(type) {
			case string:
				isRecipe = (t == "Recipe")
			case []any:
				for _, sub := range t {
					if s, ok := sub.(string); ok && s == "Recipe" {
						isRecipe = true
						break
					}
				}
			}
			if isRecipe {
				return parseJSONLDRecipeMap(v)
			}
		}
		if graph, ok := v["@graph"].([]any); ok {
			for _, item := range graph {
				if r := findRecipeInJSON(item); r != nil {
					return r
				}
			}
		}
	}
	return nil
}

func parseJSONLDRecipeMap(m map[string]any) *Recipe {
	name, _ := m["name"].(string)
	name = html.UnescapeString(strings.TrimSpace(name))

	var ingredients []string
	if rawIngs, ok := m["recipeIngredient"].([]any); ok {
		for _, ing := range rawIngs {
			if s, ok := ing.(string); ok && strings.TrimSpace(s) != "" {
				ingredients = append(ingredients, html.UnescapeString(strings.TrimSpace(s)))
			}
		}
	}

	var instructions []string
	if rawInst, ok := m["recipeInstructions"].([]any); ok {
		for _, inst := range rawInst {
			switch step := inst.(type) {
			case string:
				if strings.TrimSpace(step) != "" {
					instructions = append(instructions, html.UnescapeString(strings.TrimSpace(step)))
				}
			case map[string]any:
				// HowToStep or HowToSection
				if text, ok := step["text"].(string); ok && strings.TrimSpace(text) != "" {
					instructions = append(instructions, html.UnescapeString(strings.TrimSpace(text)))
				} else if itemList, ok := step["itemListElement"].([]any); ok {
					for _, sub := range itemList {
						if subMap, ok := sub.(map[string]any); ok {
							if subText, ok := subMap["text"].(string); ok && strings.TrimSpace(subText) != "" {
								instructions = append(instructions, html.UnescapeString(strings.TrimSpace(subText)))
							}
						}
					}
				}
			}
		}
	}

	if name == "" && len(ingredients) == 0 {
		return nil
	}

	return &Recipe{
		Name:         name,
		Ingredients:  ingredients,
		Instructions: instructions,
	}
}

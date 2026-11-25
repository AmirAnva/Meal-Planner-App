package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

const (
	accountSessionCookie = "meal_planner_session"
	accountSessionTTL    = 7 * 24 * time.Hour
	maxAccountNameLength = 100
	maxPreferenceLength  = 100
	maxPreferenceCount   = 50
	minPasswordLength    = 8
	maxPasswordLength    = 72
)

type Account struct {
	ID                  int64    `json:"id"`
	Name                string   `json:"name"`
	DietaryPreferences  []string `json:"dietary_preferences"`
	DietaryRestrictions []string `json:"dietary_restrictions"`
	TypicalServings     int      `json:"typical_servings"`
}

type accountInput struct {
	Name                string   `json:"name"`
	Password            string   `json:"password"`
	DietaryPreferences  []string `json:"dietary_preferences"`
	DietaryRestrictions []string `json:"dietary_restrictions"`
	TypicalServings     int      `json:"typical_servings"`
}

type accountUpdateInput struct {
	Name                string   `json:"name"`
	Password            string   `json:"password"`
	DietaryPreferences  []string `json:"dietary_preferences"`
	DietaryRestrictions []string `json:"dietary_restrictions"`
	TypicalServings     int      `json:"typical_servings"`
}

type accountLoginInput struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

func (input accountInput) account() Account {
	return normalizeAccount(Account{
		Name:                input.Name,
		DietaryPreferences:  input.DietaryPreferences,
		DietaryRestrictions: input.DietaryRestrictions,
		TypicalServings:     input.TypicalServings,
	})
}

func (input accountUpdateInput) account() Account {
	return normalizeAccount(Account{
		Name:                input.Name,
		DietaryPreferences:  input.DietaryPreferences,
		DietaryRestrictions: input.DietaryRestrictions,
		TypicalServings:     input.TypicalServings,
	})
}

func normalizeAccount(account Account) Account {
	account.Name = strings.TrimSpace(account.Name)
	if account.DietaryPreferences == nil {
		account.DietaryPreferences = []string{}
	}
	if account.DietaryRestrictions == nil {
		account.DietaryRestrictions = []string{}
	}
	for i := range account.DietaryPreferences {
		account.DietaryPreferences[i] = strings.TrimSpace(account.DietaryPreferences[i])
	}
	for i := range account.DietaryRestrictions {
		account.DietaryRestrictions[i] = strings.TrimSpace(account.DietaryRestrictions[i])
	}
	return account
}

func (account Account) validate() bool {
	if account.Name == "" || utf8.RuneCountInString(account.Name) > maxAccountNameLength {
		return false
	}
	if account.TypicalServings < 1 || account.TypicalServings > 20 {
		return false
	}
	return validPreferences(account.DietaryPreferences) && validPreferences(account.DietaryRestrictions)
}

func validPreferences(preferences []string) bool {
	if len(preferences) > maxPreferenceCount {
		return false
	}
	for _, preference := range preferences {
		if preference == "" || utf8.RuneCountInString(preference) > maxPreferenceLength {
			return false
		}
	}
	return true
}

func validPassword(password string) bool {
	return len(password) >= minPasswordLength && len(password) <= maxPasswordLength
}

func (api *API) registerAccount(w http.ResponseWriter, r *http.Request) {
	var input accountInput
	if decodeRequest(r, &input) != nil {
		writeError(w, http.StatusBadRequest, "invalid account JSON")
		return
	}
	account := input.account()
	if !account.validate() || !validPassword(input.Password) {
		writeError(w, http.StatusBadRequest, "name, password (8-72 bytes), and typical_servings (1-20) are required; preferences must be non-empty strings")
		return
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	created, err := api.store.CreateAccount(account, string(passwordHash))
	if errors.Is(err, ErrAccountExists) {
		writeError(w, http.StatusConflict, "account name already exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create account")
		return
	}
	if err := api.startAccountSession(w, r, created.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not start account session")
		return
	}
	w.Header().Set("Location", "/api/account")
	writeJSON(w, http.StatusCreated, created)
}

func (api *API) loginAccount(w http.ResponseWriter, r *http.Request) {
	var input accountLoginInput
	if decodeRequest(r, &input) != nil || strings.TrimSpace(input.Name) == "" || input.Password == "" {
		writeError(w, http.StatusBadRequest, "name and password are required")
		return
	}
	account, passwordHash, err := api.store.GetAccountByName(strings.TrimSpace(input.Name))
	if errors.Is(err, ErrAccountNotFound) {
		writeError(w, http.StatusUnauthorized, "invalid name or password")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not sign in")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)) != nil {
		writeError(w, http.StatusUnauthorized, "invalid name or password")
		return
	}
	if err := api.startAccountSession(w, r, account.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not start account session")
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (api *API) getAccountProfile(w http.ResponseWriter, r *http.Request) {
	accountID, ok := api.authenticatedAccountID(w, r)
	if !ok {
		return
	}
	account, err := api.store.GetAccount(accountID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load account")
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (api *API) updateAccountProfile(w http.ResponseWriter, r *http.Request) {
	accountID, ok := api.authenticatedAccountID(w, r)
	if !ok {
		return
	}
	var input accountUpdateInput
	if decodeRequest(r, &input) != nil {
		writeError(w, http.StatusBadRequest, "invalid account JSON")
		return
	}
	account := input.account()
	account.ID = accountID
	if !account.validate() || (input.Password != "" && !validPassword(input.Password)) {
		writeError(w, http.StatusBadRequest, "name and typical_servings (1-20) are required; password must be 8-72 bytes when provided; preferences must be non-empty strings")
		return
	}
	var passwordHash string
	if input.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not update account")
			return
		}
		passwordHash = string(hash)
	}
	updated, err := api.store.UpdateAccount(account, passwordHash)
	if errors.Is(err, ErrAccountExists) {
		writeError(w, http.StatusConflict, "account name already exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update account")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (api *API) logoutAccount(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(accountSessionCookie)
	if err == nil {
		tokenHash := hashSessionToken(cookie.Value)
		if err := api.store.DeleteAccountSession(tokenHash); err != nil {
			writeError(w, http.StatusInternalServerError, "could not sign out")
			return
		}
	}
	http.SetCookie(w, &http.Cookie{
		Name:     accountSessionCookie,
		Value:    "",
		Path:     "/api",
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (api *API) authenticatedAccountID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	cookie, err := r.Cookie(accountSessionCookie)
	if err != nil || cookie.Value == "" {
		writeError(w, http.StatusUnauthorized, "sign in required")
		return 0, false
	}
	accountID, err := api.store.GetAccountIDBySession(hashSessionToken(cookie.Value))
	if errors.Is(err, ErrSessionNotFound) {
		writeError(w, http.StatusUnauthorized, "sign in required")
		return 0, false
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not authenticate account")
		return 0, false
	}
	return accountID, true
}

func (api *API) startAccountSession(w http.ResponseWriter, r *http.Request, accountID int64) error {
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return err
	}
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)
	expiresAt := time.Now().Add(accountSessionTTL)
	if err := api.store.CreateAccountSession(accountID, hashSessionToken(token), expiresAt.Unix()); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     accountSessionCookie,
		Value:    token,
		Path:     "/api",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
	})
	return nil
}

func hashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

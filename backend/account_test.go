package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestAccountRegistrationProfileAndLoginLifecycle(t *testing.T) {
	handler, dataPath := newTestAPI(t)
	register := httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(`{
		"name":"Jamie",
		"password":"correct horse",
		"dietary_preferences":["vegetarian"],
		"dietary_restrictions":["peanuts"],
		"typical_servings":4
	}`))
	registerResponse := httptest.NewRecorder()
	handler.ServeHTTP(registerResponse, register)
	if registerResponse.Code != http.StatusCreated {
		t.Fatalf("register status = %d, want %d: %s", registerResponse.Code, http.StatusCreated, registerResponse.Body.String())
	}
	if strings.Contains(registerResponse.Body.String(), "password") || strings.Contains(registerResponse.Body.String(), "correct horse") {
		t.Fatalf("registration response exposed password data: %s", registerResponse.Body.String())
	}
	var created Account
	if err := json.Unmarshal(registerResponse.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode account response: %v", err)
	}
	if created.Name != "Jamie" || created.TypicalServings != 4 || len(created.DietaryPreferences) != 1 || created.DietaryPreferences[0] != "vegetarian" {
		t.Fatalf("unexpected registered profile: %+v", created)
	}
	persisted, err := OpenSQLiteRepository(dataPath)
	if err != nil {
		t.Fatalf("reopen account database: %v", err)
	}
	defer persisted.Close()
	_, passwordHash, err := persisted.GetAccountByName("Jamie")
	if err != nil {
		t.Fatalf("load persisted account: %v", err)
	}
	if passwordHash == "correct horse" {
		t.Fatal("account password was persisted in plain text")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte("correct horse")); err != nil {
		t.Fatalf("verify stored password hash: %v", err)
	}
	cookies := registerResponse.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != accountSessionCookie || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode {
		t.Fatalf("registration session cookie = %+v, want HttpOnly account cookie", cookies)
	}

	profileRequest := httptest.NewRequest(http.MethodGet, "/api/account", nil)
	profileRequest.AddCookie(cookies[0])
	profileResponse := httptest.NewRecorder()
	handler.ServeHTTP(profileResponse, profileRequest)
	if profileResponse.Code != http.StatusOK || strings.Contains(profileResponse.Body.String(), "password") {
		t.Fatalf("GET profile = (%d, %s), want password-free 200 response", profileResponse.Code, profileResponse.Body.String())
	}

	updateRequest := httptest.NewRequest(http.MethodPut, "/api/account", strings.NewReader(`{
		"name":"Jamie C",
		"password":"new password",
		"dietary_preferences":["vegan"],
		"dietary_restrictions":[],
		"typical_servings":2
	}`))
	updateRequest.AddCookie(cookies[0])
	updateResponse := httptest.NewRecorder()
	handler.ServeHTTP(updateResponse, updateRequest)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("PUT profile status = %d, want %d: %s", updateResponse.Code, http.StatusOK, updateResponse.Body.String())
	}
	var updated Account
	if err := json.Unmarshal(updateResponse.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated profile: %v", err)
	}
	if updated.Name != "Jamie C" || updated.TypicalServings != 2 || len(updated.DietaryPreferences) != 1 || updated.DietaryPreferences[0] != "vegan" || len(updated.DietaryRestrictions) != 0 {
		t.Fatalf("updated profile = %+v", updated)
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/api/accounts/logout", nil)
	logoutRequest.AddCookie(cookies[0])
	logoutResponse := httptest.NewRecorder()
	handler.ServeHTTP(logoutResponse, logoutRequest)
	if logoutResponse.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d, want %d", logoutResponse.Code, http.StatusNoContent)
	}
	profileRequest = httptest.NewRequest(http.MethodGet, "/api/account", nil)
	profileRequest.AddCookie(cookies[0])
	profileResponse = httptest.NewRecorder()
	handler.ServeHTTP(profileResponse, profileRequest)
	if profileResponse.Code != http.StatusUnauthorized {
		t.Fatalf("GET profile after logout status = %d, want %d", profileResponse.Code, http.StatusUnauthorized)
	}

	wrongPasswordRequest := httptest.NewRequest(http.MethodPost, "/api/accounts/login", strings.NewReader(`{"name":"jamie c","password":"correct horse"}`))
	wrongPasswordResponse := httptest.NewRecorder()
	handler.ServeHTTP(wrongPasswordResponse, wrongPasswordRequest)
	if wrongPasswordResponse.Code != http.StatusUnauthorized {
		t.Fatalf("old password login status = %d, want %d", wrongPasswordResponse.Code, http.StatusUnauthorized)
	}

	loginRequest := httptest.NewRequest(http.MethodPost, "/api/accounts/login", strings.NewReader(`{"name":"jamie c","password":"new password"}`))
	loginResponse := httptest.NewRecorder()
	handler.ServeHTTP(loginResponse, loginRequest)
	if loginResponse.Code != http.StatusOK || strings.Contains(loginResponse.Body.String(), "password") {
		t.Fatalf("login response = (%d, %s), want password-free 200 response", loginResponse.Code, loginResponse.Body.String())
	}
}

func TestAccountRegistrationValidationAndDuplicate(t *testing.T) {
	handler, _ := newTestAPI(t)
	for _, body := range []string{
		`{"name":"Jamie","password":"short","typical_servings":2}`,
		`{"name":"Jamie","password":"correct horse","typical_servings":0}`,
		`{"name":"Jamie","password":"correct horse","dietary_preferences":["  "],"typical_servings":2}`,
	} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(body)))
		if response.Code != http.StatusBadRequest {
			t.Errorf("registration with %s status = %d, want %d", body, response.Code, http.StatusBadRequest)
		}
	}
	for _, name := range []string{"Jamie", "jamie"} {
		response := httptest.NewRecorder()
		body := `{"name":"` + name + `","password":"correct horse","typical_servings":2}`
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/accounts", strings.NewReader(body)))
		wantStatus := http.StatusCreated
		if name == "jamie" {
			wantStatus = http.StatusConflict
		}
		if response.Code != wantStatus {
			t.Errorf("registration for %q status = %d, want %d: %s", name, response.Code, wantStatus, response.Body.String())
		}
	}
}

func TestAccountProfileRequiresSession(t *testing.T) {
	handler, _ := newTestAPI(t)
	for _, method := range []string{http.MethodGet, http.MethodPut} {
		response := httptest.NewRecorder()
		request := httptest.NewRequest(method, "/api/account", strings.NewReader(`{"name":"Jamie","typical_servings":2}`))
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Errorf("%s profile without session status = %d, want %d", method, response.Code, http.StatusUnauthorized)
		}
	}
}

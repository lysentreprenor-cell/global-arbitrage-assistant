export function humanizeAuthError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error || "");

  const lower = raw.toLowerCase();

  if (lower.includes("invalid email")) {
    return "Wpisz poprawny adres email.";
  }

  if (lower.includes("password") && lower.includes("short")) {
    return "Hasło jest za krótkie.";
  }

  if (lower.includes("password") && lower.includes("match")) {
    return "Hasła nie są takie same.";
  }

  if (lower.includes("already exists") || lower.includes("duplicate") || lower.includes("unique") || lower.includes("already registered")) {
    return "To konto już istnieje.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "Problem z połączeniem. Spróbuj ponownie.";
  }

  if (lower.includes("unauthorized") || lower.includes("invalid credentials")) {
    return "Nieprawidłowe dane logowania.";
  }

  if (lower.includes("required")) {
    return "Uzupełnij wszystkie wymagane pola.";
  }

  return "Nie udało się wykonać operacji. Spróbuj ponownie.";
}

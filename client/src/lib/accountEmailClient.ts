export async function sendRegistrationEmailTrigger(user: any) {
  try {
    await fetch("/api/auth/send-registration-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user }),
    });
  } catch {}
}

export async function sendActivationEmailTrigger(user: any) {
  try {
    await fetch("/api/auth/send-activation-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ user }),
    });
  } catch {}
}

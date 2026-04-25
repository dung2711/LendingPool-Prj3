export function maskEmail(email: string): string {
  const [localPart = "", domain = ""] = email.split("@");
  if (!localPart || !domain) {
    return "***";
  }

  const maskedLocal =
    localPart.length <= 2
      ? `${localPart[0] ?? ""}*`
      : `${localPart.slice(0, 2)}***`;

  return `${maskedLocal}@${domain}`;
}

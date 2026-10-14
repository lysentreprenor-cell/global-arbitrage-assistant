// Node globals the server route handlers rely on.
const g = globalThis as any;
if (!g.Buffer) {
  g.Buffer = {
    from(input: string) {
      const bytes = new TextEncoder().encode(String(input));
      return {
        toString(encoding?: string) {
          if (encoding !== "base64") return new TextDecoder().decode(bytes);
          let bin = "";
          bytes.forEach(b => (bin += String.fromCharCode(b)));
          return btoa(bin);
        },
      };
    },
  };
}
export {};

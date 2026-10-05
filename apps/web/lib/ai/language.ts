const LANGUAGE: Record<string, string> = { nb: "Norwegian (bokmål)", nn: "Norwegian (nynorsk)", en: "English" };
export const languageOf = (locale: string | null | undefined): string => LANGUAGE[locale ?? "en"] ?? "English";

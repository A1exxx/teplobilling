// import.meta.glob предоставляют Vite/Vitest на этапе сборки; пакет сам от vite не зависит,
// поэтому объявляем только используемую сигнатуру.
interface ImportMeta {
  glob(
    pattern: string,
    options: { query: string; import: string; eager: true },
  ): Record<string, unknown>
}

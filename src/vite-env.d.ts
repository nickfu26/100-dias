/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module 'virtual:day-index' {
  const index: Record<number, import('./content/types').Bilingual>;
  export default index;
}

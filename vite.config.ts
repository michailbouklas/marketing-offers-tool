import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  // Vue runs only inside the gp-grid host on /sales/explore; explicit flags
  // silence its esm-bundler warning and drop devtools from production.
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  ssr: {
    noExternal: ["svelte-sonner"],
  },
});

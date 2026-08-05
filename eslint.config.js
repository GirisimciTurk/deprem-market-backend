import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

/**
 * Backend'in İLK lint yapılandırması — bu proje bugüne kadar hiç lint'lenmedi
 * (package.json'da `lint` scripti bile yoktu), diğer üç proje lint'leniyordu.
 *
 * Kural şiddetleri storefront/admin/vendor ile HİZALI: `no-explicit-any` uyarı
 * (kod tabanında yaygın, tek tek tiplemek ayrı bir iş), kullanılmayan değişken
 * hata ama `_` öneki kaçış yolu var.
 *
 * Tip-farkındalıklı kurallar (typescript-eslint'in `recommendedTypeChecked`)
 * BİLEREK açılmadı: tüm projeyi tip bilgisiyle taramak yavaş ve ilk turda
 * yüzlerce bulgu üretir. Tip hataları zaten `npx tsc --noEmit` ile yakalanıyor.
 */
export default defineConfig([
  globalIgnores([
    ".medusa",
    "dist",
    "build",
    "node_modules",
    // Üretilmiş migration'lar ve MikroORM snapshot'ları elle yazılmıyor.
    "src/**/migrations/**",
  ]),
  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Medusa modül servisleri MedusaService factory'sinden metot türetir;
      // bunlar TS'e `any` görünür ve boş fonksiyon gövdeleri normaldir.
      "@typescript-eslint/no-empty-object-type": "warn",
      // Hata zincirleme (`new Error(msg, { cause })`) ES2022 gerektiriyor;
      // bu projenin tsconfig hedefi desteklemiyor ("Expected 0-1 arguments").
      // Kural açık kalsın ki tsconfig ileride yükseltilince görünür olsun,
      // ama şu an derlemeyi kıramayacağı için hata değil uyarı.
      "preserve-caught-error": "warn",
    },
  },
])

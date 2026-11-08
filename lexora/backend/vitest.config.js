import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Le setup s'exécute AVANT l'import de l'app : il fixe la base de test
    // et le secret JWT, puisque db.js lit DB_PATH dès son import.
    setupFiles: ['./tests/setup.js'],
    // Une seule base SQLite partagée : on exécute les fichiers l'un après l'autre.
    fileParallelism: false,
  },
});

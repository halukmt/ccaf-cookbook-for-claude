// The fixed data all steps share: one labelled validation set, and one separate production set.
// Calibrating and scoring on the same data would flatter it, so the two never overlap.

import { generateDocuments } from "./simulator.js";

export const VALIDATION_SEED = 20310601;
export const PRODUCTION_SEED = 20310915;
export const VALIDATION_COUNT = 4000;
export const PRODUCTION_COUNT = 5000;

export const validationSet = (seed = VALIDATION_SEED) => generateDocuments(VALIDATION_COUNT, seed);
export const productionSet = (seed = PRODUCTION_SEED) => generateDocuments(PRODUCTION_COUNT, seed);

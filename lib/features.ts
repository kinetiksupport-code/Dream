// What exists in Dream. The single list lives with the server
// (supabase/functions/dream-api/features.mjs) because the AI's
// self-knowledge is generated from it; the web reads the same list.
export {
  DREAM_FEATURES,
  FEATURE_FLAGS,
  activeFeatures,
} from "../supabase/functions/dream-api/features.mjs";

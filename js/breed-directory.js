/**
 * js/breed-directory.js
 *
 * Canine breed reference directory — Group, Size class, adult weight range
 * (kg), and typical lifespan, for 227 breeds. Sourced from a
 * user-supplied breed index (Canine Breed Data, 2026-08-18): Breed, Group,
 * Size, Weight Range, and Typical Lifespan are copied directly from that
 * source. Everything else derived from it is explicitly marked as such:
 *
 * - `senior_age_years` is NOT in the source file. It's a heuristic derived
 *   here from the source's Typical Lifespan bucket (shorter typical
 *   lifespan -> senior status begins earlier), not a clinically-cited
 *   per-breed age cutoff. Treat it as a reasonable default to refine, not
 *   a sourced fact.
 *
 * This file has no cardiac/blood-panel/disease-risk data — the source
 * index doesn't include it. js/vet-knowledge-base.js still owns those
 * (species-level + the small hand-curated BREED_OVERRIDES set), and uses
 * this directory only for weight-range context and breed-informed age
 * banding.
 *
 * Works in both the browser (plain global, loaded via <script>) and Node
 * (`require()`), matching js/vet-knowledge-base.js.
 */

const BREED_DIRECTORY = {
  "affenpinscher": {
    "slug": "affenpinscher",
    "label": "Affenpinscher",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "afghan_hound": {
    "slug": "afghan_hound",
    "label": "Afghan Hound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 23,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "airedale_terrier": {
    "slug": "airedale_terrier",
    "label": "Airedale Terrier",
    "group": "Terrier",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "akita": {
    "slug": "akita",
    "label": "Akita",
    "group": "Utility",
    "size": "Large",
    "weight_min_kg": 32,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "alaskan_malamute": {
    "slug": "alaskan_malamute",
    "label": "Alaskan Malamute",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 34,
    "weight_max_kg": 43,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "anatolian_shepherd_dog": {
    "slug": "anatolian_shepherd_dog",
    "label": "Anatolian Shepherd Dog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 40,
    "weight_max_kg": 65,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "australian_cattle_dog": {
    "slug": "australian_cattle_dog",
    "label": "Australian Cattle Dog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 15,
    "weight_max_kg": 22,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "australian_shepherd": {
    "slug": "australian_shepherd",
    "label": "Australian Shepherd",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 29,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "australian_silky_terrier": {
    "slug": "australian_silky_terrier",
    "label": "Australian Silky Terrier",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3.5,
    "weight_max_kg": 4.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "australian_terrier": {
    "slug": "australian_terrier",
    "label": "Australian Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 5,
    "weight_max_kg": 6.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "azawakh": {
    "slug": "azawakh",
    "label": "Azawakh",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 15,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "barbet": {
    "slug": "barbet",
    "label": "Barbet",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 18,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "basenji": {
    "slug": "basenji",
    "label": "Basenji",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 9.5,
    "weight_max_kg": 11,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "basset_bleu_de_gascogne": {
    "slug": "basset_bleu_de_gascogne",
    "label": "Basset Bleu De Gascogne",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 16,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "basset_fauve_de_bretagne": {
    "slug": "basset_fauve_de_bretagne",
    "label": "Basset Fauve De Bretagne",
    "group": "Hound",
    "size": "Small-Medium",
    "weight_min_kg": 13,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "grand_basset_griffon_vendeen": {
    "slug": "grand_basset_griffon_vendeen",
    "label": "Grand Basset Griffon Vendeen",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "petit_basset_griffon_vendeen": {
    "slug": "petit_basset_griffon_vendeen",
    "label": "Petit Basset Griffon Vendeen",
    "group": "Hound",
    "size": "Small-Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "basset_hound": {
    "slug": "basset_hound",
    "label": "Basset Hound",
    "group": "Hound",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 29,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bavarian_mountain_hound": {
    "slug": "bavarian_mountain_hound",
    "label": "Bavarian Mountain Hound",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "beagle": {
    "slug": "beagle",
    "label": "Beagle",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 9,
    "weight_max_kg": 14,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "bearded_collie": {
    "slug": "bearded_collie",
    "label": "Bearded Collie",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "beauceron": {
    "slug": "beauceron",
    "label": "Beauceron",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bedlington_terrier": {
    "slug": "bedlington_terrier",
    "label": "Bedlington Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 8,
    "weight_max_kg": 10.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "groenendael_belgian_shepherd_dog": {
    "slug": "groenendael_belgian_shepherd_dog",
    "label": "Groenendael Belgian Shepherd Dog",
    "group": "Pastoral",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "laekenois_belgian_shepherd_dog": {
    "slug": "laekenois_belgian_shepherd_dog",
    "label": "Laekenois Belgian Shepherd Dog",
    "group": "Pastoral",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "malinois_belgian_shepherd_dog": {
    "slug": "malinois_belgian_shepherd_dog",
    "label": "Malinois Belgian Shepherd Dog",
    "group": "Pastoral",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "tervueren_belgian_shepherd_dog": {
    "slug": "tervueren_belgian_shepherd_dog",
    "label": "Tervueren Belgian Shepherd Dog",
    "group": "Pastoral",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bergamasco": {
    "slug": "bergamasco",
    "label": "Bergamasco",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 26,
    "weight_max_kg": 38,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "bernese_mountain_dog": {
    "slug": "bernese_mountain_dog",
    "label": "Bernese Mountain Dog",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 35,
    "weight_max_kg": 50,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "bichon_frise": {
    "slug": "bichon_frise",
    "label": "Bichon Frise",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "black_and_tan_coonhound": {
    "slug": "black_and_tan_coonhound",
    "label": "Black & Tan Coonhound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 34,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bloodhound": {
    "slug": "bloodhound",
    "label": "Bloodhound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 36,
    "weight_max_kg": 50,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "bolognese": {
    "slug": "bolognese",
    "label": "Bolognese",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 2.5,
    "weight_max_kg": 4,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "border_collie": {
    "slug": "border_collie",
    "label": "Border Collie",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 12,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "border_terrier": {
    "slug": "border_terrier",
    "label": "Border Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 5,
    "weight_max_kg": 7,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "borzoi": {
    "slug": "borzoi",
    "label": "Borzoi",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 27,
    "weight_max_kg": 48,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "boston_terrier": {
    "slug": "boston_terrier",
    "label": "Boston Terrier",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 4.5,
    "weight_max_kg": 11,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bouvier_des_flandres": {
    "slug": "bouvier_des_flandres",
    "label": "Bouvier Des Flandres",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 27,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "boxer": {
    "slug": "boxer",
    "label": "Boxer",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bracco_italiano": {
    "slug": "bracco_italiano",
    "label": "Bracco Italiano",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 40,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "braque_d_auvergne": {
    "slug": "braque_d_auvergne",
    "label": "Braque D'Auvergne",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 22,
    "weight_max_kg": 28,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "briard": {
    "slug": "briard",
    "label": "Briard",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 22,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "brittany": {
    "slug": "brittany",
    "label": "Brittany",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bull_terrier": {
    "slug": "bull_terrier",
    "label": "Bull Terrier",
    "group": "Terrier",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 38,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "miniature_bull_terrier": {
    "slug": "miniature_bull_terrier",
    "label": "Miniature Bull Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 10,
    "weight_max_kg": 15,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "bulldog": {
    "slug": "bulldog",
    "label": "Bulldog",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 25,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "bullmastiff": {
    "slug": "bullmastiff",
    "label": "Bullmastiff",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 41,
    "weight_max_kg": 59,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "cairn_terrier": {
    "slug": "cairn_terrier",
    "label": "Cairn Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 6,
    "weight_max_kg": 7.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "canaan_dog": {
    "slug": "canaan_dog",
    "label": "Canaan Dog",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "canadian_eskimo_dog": {
    "slug": "canadian_eskimo_dog",
    "label": "Canadian Eskimo Dog",
    "group": "Working",
    "size": "Medium",
    "weight_min_kg": 30,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "catalan_sheepdog": {
    "slug": "catalan_sheepdog",
    "label": "Catalan Sheepdog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 17,
    "weight_max_kg": 22,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "cavalier_king_charles_spaniel": {
    "slug": "cavalier_king_charles_spaniel",
    "label": "Cavalier King Charles Spaniel",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 5.4,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "cesky_terrier": {
    "slug": "cesky_terrier",
    "label": "Cesky Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 6,
    "weight_max_kg": 10,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "long_coat_chihuahua": {
    "slug": "long_coat_chihuahua",
    "label": "Long Coat Chihuahua",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 1.5,
    "weight_max_kg": 3,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "smooth_coat_chihuahua": {
    "slug": "smooth_coat_chihuahua",
    "label": "Smooth Coat Chihuahua",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 1.5,
    "weight_max_kg": 3,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "chinese_crested": {
    "slug": "chinese_crested",
    "label": "Chinese Crested",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 2,
    "weight_max_kg": 5.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "chow_chow": {
    "slug": "chow_chow",
    "label": "Chow Chow",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 32,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "cirneco_dell_etna": {
    "slug": "cirneco_dell_etna",
    "label": "Cirneco Dell'Etna",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 8,
    "weight_max_kg": 12,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "rough_collie": {
    "slug": "rough_collie",
    "label": "Rough Collie",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 18,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "smooth_collie": {
    "slug": "smooth_collie",
    "label": "Smooth Collie",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 18,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "coton_de_tulear": {
    "slug": "coton_de_tulear",
    "label": "Coton De Tulear",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3.5,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "long_haired_dachshund": {
    "slug": "long_haired_dachshund",
    "label": "Long Haired Dachshund",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 9,
    "weight_max_kg": 12,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "miniature_long_haired_dachshund": {
    "slug": "miniature_long_haired_dachshund",
    "label": "Miniature Long Haired Dachshund",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "miniature_smooth_haired_dachshund": {
    "slug": "miniature_smooth_haired_dachshund",
    "label": "Miniature Smooth Haired Dachshund",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "miniature_wire_haired_dachshund": {
    "slug": "miniature_wire_haired_dachshund",
    "label": "Miniature Wire Haired Dachshund",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "smooth_haired_dachshund": {
    "slug": "smooth_haired_dachshund",
    "label": "Smooth Haired Dachshund",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 9,
    "weight_max_kg": 12,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "wire_haired_dachshund": {
    "slug": "wire_haired_dachshund",
    "label": "Wire Haired Dachshund",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 9,
    "weight_max_kg": 12,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "dalmatian": {
    "slug": "dalmatian",
    "label": "Dalmatian",
    "group": "Utility",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "dandie_dinmont_terrier": {
    "slug": "dandie_dinmont_terrier",
    "label": "Dandie Dinmont Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 8,
    "weight_max_kg": 11,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "deerhound": {
    "slug": "deerhound",
    "label": "Deerhound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 36,
    "weight_max_kg": 50,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "dobermann": {
    "slug": "dobermann",
    "label": "Dobermann",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 27,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "dogue_de_bordeaux": {
    "slug": "dogue_de_bordeaux",
    "label": "Dogue de Bordeaux",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 45,
    "weight_max_kg": 65,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "english_setter": {
    "slug": "english_setter",
    "label": "English Setter",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "black_and_tan_english_toy_terrier": {
    "slug": "black_and_tan_english_toy_terrier",
    "label": "Black & Tan English Toy Terrier",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 2.7,
    "weight_max_kg": 3.6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "entlebucher_mountain_dog": {
    "slug": "entlebucher_mountain_dog",
    "label": "Entlebucher Mountain Dog",
    "group": "Working",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "estrela_mountain_dog": {
    "slug": "estrela_mountain_dog",
    "label": "Estrela Mountain Dog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 50,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "eurasier": {
    "slug": "eurasier",
    "label": "Eurasier",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "finnish_lapphund": {
    "slug": "finnish_lapphund",
    "label": "Finnish Lapphund",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 15,
    "weight_max_kg": 24,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "finnish_spitz": {
    "slug": "finnish_spitz",
    "label": "Finnish Spitz",
    "group": "Hound",
    "size": "Small-Medium",
    "weight_min_kg": 12,
    "weight_max_kg": 16,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "smooth_fox_terrier": {
    "slug": "smooth_fox_terrier",
    "label": "Smooth Fox Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 7,
    "weight_max_kg": 8.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "wire_fox_terrier": {
    "slug": "wire_fox_terrier",
    "label": "Wire Fox Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 7,
    "weight_max_kg": 8.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "foxhound": {
    "slug": "foxhound",
    "label": "Foxhound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 34,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "french_bulldog": {
    "slug": "french_bulldog",
    "label": "French Bulldog",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 8,
    "weight_max_kg": 14,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "german_longhaired_pointer": {
    "slug": "german_longhaired_pointer",
    "label": "German Longhaired Pointer",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 35,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "german_pinscher": {
    "slug": "german_pinscher",
    "label": "German Pinscher",
    "group": "Working",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "german_shepherd_dog": {
    "slug": "german_shepherd_dog",
    "label": "German Shepherd Dog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 22,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "german_shorthaired_pointer": {
    "slug": "german_shorthaired_pointer",
    "label": "German Shorthaired Pointer",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "klein_german_spitz": {
    "slug": "klein_german_spitz",
    "label": "Klein German Spitz",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 9,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "mittel_german_spitz": {
    "slug": "mittel_german_spitz",
    "label": "Mittel German Spitz",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 9,
    "weight_max_kg": 11.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "german_wirehaired_pointer": {
    "slug": "german_wirehaired_pointer",
    "label": "German Wirehaired Pointer",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "giant_schnauzer": {
    "slug": "giant_schnauzer",
    "label": "Giant Schnauzer",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 48,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "glen_of_imaal_terrier": {
    "slug": "glen_of_imaal_terrier",
    "label": "Glen Of Imaal Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 15.5,
    "weight_max_kg": 16.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "gordon_setter": {
    "slug": "gordon_setter",
    "label": "Gordon Setter",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 36,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "grand_bleu_de_gascogne": {
    "slug": "grand_bleu_de_gascogne",
    "label": "Grand Bleu De Gascogne",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 32,
    "weight_max_kg": 38,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "great_dane": {
    "slug": "great_dane",
    "label": "Great Dane",
    "group": "Working",
    "size": "Extra large",
    "weight_min_kg": 45,
    "weight_max_kg": 90,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "great_swiss_mountain_dog": {
    "slug": "great_swiss_mountain_dog",
    "label": "Great Swiss Mountain Dog",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 40,
    "weight_max_kg": 64,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "greenland_dog": {
    "slug": "greenland_dog",
    "label": "Greenland Dog",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 47,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "greyhound": {
    "slug": "greyhound",
    "label": "Greyhound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 27,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "griffon_bruxellois": {
    "slug": "griffon_bruxellois",
    "label": "Griffon Bruxellois",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3.5,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "griffon_fauve_de_bretagne": {
    "slug": "griffon_fauve_de_bretagne",
    "label": "Griffon Fauve De Bretagne",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 15,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "hamiltonstovare": {
    "slug": "hamiltonstovare",
    "label": "Hamiltonstovare",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 22,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "harrier": {
    "slug": "harrier",
    "label": "Harrier",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "havanese": {
    "slug": "havanese",
    "label": "Havanese",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 7,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "hovawart": {
    "slug": "hovawart",
    "label": "Hovawart",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "hungarian_kuvasz": {
    "slug": "hungarian_kuvasz",
    "label": "Hungarian Kuvasz",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 52,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "hungarian_mudi": {
    "slug": "hungarian_mudi",
    "label": "Hungarian Mudi",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 8,
    "weight_max_kg": 13,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "hungarian_puli": {
    "slug": "hungarian_puli",
    "label": "Hungarian Puli",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 10,
    "weight_max_kg": 15,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "hungarian_pumi": {
    "slug": "hungarian_pumi",
    "label": "Hungarian Pumi",
    "group": "Pastoral",
    "size": "Small",
    "weight_min_kg": 8,
    "weight_max_kg": 13,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "hungarian_vizsla": {
    "slug": "hungarian_vizsla",
    "label": "Hungarian Vizsla",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 18,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "hungarian_wirehaired_vizsla": {
    "slug": "hungarian_wirehaired_vizsla",
    "label": "Hungarian Wirehaired Vizsla",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "ibizan_hound": {
    "slug": "ibizan_hound",
    "label": "Ibizan Hound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 19,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "icelandic_sheepdog": {
    "slug": "icelandic_sheepdog",
    "label": "Icelandic Sheepdog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 9,
    "weight_max_kg": 14,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "irish_red_and_white_setter": {
    "slug": "irish_red_and_white_setter",
    "label": "Irish Red & White Setter",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 34,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "irish_setter": {
    "slug": "irish_setter",
    "label": "Irish Setter",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "irish_terrier": {
    "slug": "irish_terrier",
    "label": "Irish Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 11,
    "weight_max_kg": 12.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "irish_wolfhound": {
    "slug": "irish_wolfhound",
    "label": "Irish Wolfhound",
    "group": "Hound",
    "size": "Extra large",
    "weight_min_kg": 40,
    "weight_max_kg": 69,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "italian_greyhound": {
    "slug": "italian_greyhound",
    "label": "Italian Greyhound",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "italian_spinone": {
    "slug": "italian_spinone",
    "label": "Italian Spinone",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 29,
    "weight_max_kg": 39,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "jack_russell_terrier": {
    "slug": "jack_russell_terrier",
    "label": "Jack Russell Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 5,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "japanese_akita_inu": {
    "slug": "japanese_akita_inu",
    "label": "Japanese Akita Inu",
    "group": "Utility",
    "size": "Large",
    "weight_min_kg": 32,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "japanese_chin": {
    "slug": "japanese_chin",
    "label": "Japanese Chin",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 2,
    "weight_max_kg": 4.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "japanese_shiba_inu": {
    "slug": "japanese_shiba_inu",
    "label": "Japanese Shiba Inu",
    "group": "Utility",
    "size": "Small-Medium",
    "weight_min_kg": 7,
    "weight_max_kg": 10,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "japanese_spitz": {
    "slug": "japanese_spitz",
    "label": "Japanese Spitz",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 5,
    "weight_max_kg": 10,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "keeshond": {
    "slug": "keeshond",
    "label": "Keeshond",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 12,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "kerry_blue_terrier": {
    "slug": "kerry_blue_terrier",
    "label": "Kerry Blue Terrier",
    "group": "Terrier",
    "size": "Medium",
    "weight_min_kg": 15,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "king_charles_spaniel": {
    "slug": "king_charles_spaniel",
    "label": "King Charles Spaniel",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3.6,
    "weight_max_kg": 6.3,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "komondor": {
    "slug": "komondor",
    "label": "Komondor",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 40,
    "weight_max_kg": 60,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "kooikerhondje": {
    "slug": "kooikerhondje",
    "label": "Kooikerhondje",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 9,
    "weight_max_kg": 11,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "korean_jindo": {
    "slug": "korean_jindo",
    "label": "Korean Jindo",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 15,
    "weight_max_kg": 23,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "korthals_griffon": {
    "slug": "korthals_griffon",
    "label": "Korthals Griffon",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 23,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "lagotto_romagnolo": {
    "slug": "lagotto_romagnolo",
    "label": "Lagotto Romagnolo",
    "group": "Gundog",
    "size": "Small-Medium",
    "weight_min_kg": 11,
    "weight_max_kg": 16,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "lakeland_terrier": {
    "slug": "lakeland_terrier",
    "label": "Lakeland Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 7,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "lancashire_heeler": {
    "slug": "lancashire_heeler",
    "label": "Lancashire Heeler",
    "group": "Pastoral",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "large_munsterlander": {
    "slug": "large_munsterlander",
    "label": "Large Munsterlander",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 22,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "leonberger": {
    "slug": "leonberger",
    "label": "Leonberger",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 45,
    "weight_max_kg": 77,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "lhasa_apso": {
    "slug": "lhasa_apso",
    "label": "Lhasa Apso",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 5.5,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "lowchen": {
    "slug": "lowchen",
    "label": "Lowchen",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "maltese": {
    "slug": "maltese",
    "label": "Maltese",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 1.5,
    "weight_max_kg": 4,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "manchester_terrier": {
    "slug": "manchester_terrier",
    "label": "Manchester Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 5.4,
    "weight_max_kg": 10,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "maremma_sheepdog": {
    "slug": "maremma_sheepdog",
    "label": "Maremma Sheepdog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "mastiff": {
    "slug": "mastiff",
    "label": "Mastiff",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 70,
    "weight_max_kg": 100,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "miniature_american_shepherd": {
    "slug": "miniature_american_shepherd",
    "label": "Miniature American Shepherd",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 6,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "miniature_pinscher": {
    "slug": "miniature_pinscher",
    "label": "Miniature Pinscher",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3.6,
    "weight_max_kg": 4.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "miniature_schnauzer": {
    "slug": "miniature_schnauzer",
    "label": "Miniature Schnauzer",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 5.5,
    "weight_max_kg": 9,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "neapolitan_mastiff": {
    "slug": "neapolitan_mastiff",
    "label": "Neapolitan Mastiff",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 50,
    "weight_max_kg": 70,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "newfoundland": {
    "slug": "newfoundland",
    "label": "Newfoundland",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 45,
    "weight_max_kg": 68,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "norfolk_terrier": {
    "slug": "norfolk_terrier",
    "label": "Norfolk Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 5,
    "weight_max_kg": 5.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "norwegian_buhund": {
    "slug": "norwegian_buhund",
    "label": "Norwegian Buhund",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "norwegian_elkhound": {
    "slug": "norwegian_elkhound",
    "label": "Norwegian Elkhound",
    "group": "Hound",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "norwich_terrier": {
    "slug": "norwich_terrier",
    "label": "Norwich Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 5,
    "weight_max_kg": 5.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "old_english_sheepdog": {
    "slug": "old_english_sheepdog",
    "label": "Old English Sheepdog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 27,
    "weight_max_kg": 45,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "otterhound": {
    "slug": "otterhound",
    "label": "Otterhound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 52,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "papillon": {
    "slug": "papillon",
    "label": "Papillon",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3.5,
    "weight_max_kg": 5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "parson_russell_terrier": {
    "slug": "parson_russell_terrier",
    "label": "Parson Russell Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 6,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "pekingese": {
    "slug": "pekingese",
    "label": "Pekingese",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "pharaoh_hound": {
    "slug": "pharaoh_hound",
    "label": "Pharaoh Hound",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 18,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "picardy_sheepdog": {
    "slug": "picardy_sheepdog",
    "label": "Picardy Sheepdog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "pointer": {
    "slug": "pointer",
    "label": "Pointer",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "polish_hunting_dog": {
    "slug": "polish_hunting_dog",
    "label": "Polish Hunting Dog",
    "group": "Hound",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "polish_lowland_sheepdog": {
    "slug": "polish_lowland_sheepdog",
    "label": "Polish Lowland Sheepdog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "pomeranian": {
    "slug": "pomeranian",
    "label": "Pomeranian",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 1.9,
    "weight_max_kg": 3.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "miniature_poodle": {
    "slug": "miniature_poodle",
    "label": "Miniature Poodle",
    "group": "Utility",
    "size": "Small-Medium",
    "weight_min_kg": 10,
    "weight_max_kg": 15,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "standard_poodle": {
    "slug": "standard_poodle",
    "label": "Standard Poodle",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 32,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "toy_poodle": {
    "slug": "toy_poodle",
    "label": "Toy Poodle",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 6,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "portuguese_podengo": {
    "slug": "portuguese_podengo",
    "label": "Portuguese Podengo",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 9,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "portuguese_pointer": {
    "slug": "portuguese_pointer",
    "label": "Portuguese Pointer",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 16,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "portuguese_water_dog": {
    "slug": "portuguese_water_dog",
    "label": "Portuguese Water Dog",
    "group": "Working",
    "size": "Medium",
    "weight_min_kg": 16,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "pug": {
    "slug": "pug",
    "label": "Pug",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 6.3,
    "weight_max_kg": 8.1,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "pyrenean_mastiff": {
    "slug": "pyrenean_mastiff",
    "label": "Pyrenean Mastiff",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 60,
    "weight_max_kg": 80,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "pyrenean_mountain_dog": {
    "slug": "pyrenean_mountain_dog",
    "label": "Pyrenean Mountain Dog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 39,
    "weight_max_kg": 64,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "long_haired_pyrenean_sheepdog": {
    "slug": "long_haired_pyrenean_sheepdog",
    "label": "Long Haired Pyrenean Sheepdog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 8,
    "weight_max_kg": 15,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "smooth_faced_pyrenean_sheepdog": {
    "slug": "smooth_faced_pyrenean_sheepdog",
    "label": "Smooth Faced Pyrenean Sheepdog",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 13,
    "weight_max_kg": 18,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "chesapeake_bay_retriever": {
    "slug": "chesapeake_bay_retriever",
    "label": "Chesapeake Bay Retriever",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 36,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "curly_coated_retriever": {
    "slug": "curly_coated_retriever",
    "label": "Curly Coated Retriever",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 36,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "flat_coated_retriever": {
    "slug": "flat_coated_retriever",
    "label": "Flat Coated Retriever",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 36,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "golden_retriever": {
    "slug": "golden_retriever",
    "label": "Golden Retriever",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 34,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "labrador_retriever": {
    "slug": "labrador_retriever",
    "label": "Labrador Retriever",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 36,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "nova_scotia_duck_tolling_retriever": {
    "slug": "nova_scotia_duck_tolling_retriever",
    "label": "Nova Scotia Duck Tolling Retriever",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 17,
    "weight_max_kg": 23,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "rhodesian_ridgeback": {
    "slug": "rhodesian_ridgeback",
    "label": "Rhodesian Ridgeback",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 30,
    "weight_max_kg": 39,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "rottweiler": {
    "slug": "rottweiler",
    "label": "Rottweiler",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 35,
    "weight_max_kg": 60,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "russian_black_terrier": {
    "slug": "russian_black_terrier",
    "label": "Russian Black Terrier",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 36,
    "weight_max_kg": 60,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "russian_toy": {
    "slug": "russian_toy",
    "label": "Russian Toy",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 1,
    "weight_max_kg": 3,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "saluki": {
    "slug": "saluki",
    "label": "Saluki",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 18,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "samoyed": {
    "slug": "samoyed",
    "label": "Samoyed",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 17,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "schipperke": {
    "slug": "schipperke",
    "label": "Schipperke",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 3,
    "weight_max_kg": 9,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "schnauzer": {
    "slug": "schnauzer",
    "label": "Schnauzer",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "scottish_terrier": {
    "slug": "scottish_terrier",
    "label": "Scottish Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 8.5,
    "weight_max_kg": 10.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "sealyham_terrier": {
    "slug": "sealyham_terrier",
    "label": "Sealyham Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 8,
    "weight_max_kg": 9,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "shar_pei": {
    "slug": "shar_pei",
    "label": "Shar Pei",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "shetland_sheepdog": {
    "slug": "shetland_sheepdog",
    "label": "Shetland Sheepdog",
    "group": "Pastoral",
    "size": "Small",
    "weight_min_kg": 6,
    "weight_max_kg": 12,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "shih_tzu": {
    "slug": "shih_tzu",
    "label": "Shih Tzu",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 4.5,
    "weight_max_kg": 8,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "siberian_husky": {
    "slug": "siberian_husky",
    "label": "Siberian Husky",
    "group": "Working",
    "size": "Medium-Large",
    "weight_min_kg": 16,
    "weight_max_kg": 27,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "skye_terrier": {
    "slug": "skye_terrier",
    "label": "Skye Terrier",
    "group": "Terrier",
    "size": "Small-Medium",
    "weight_min_kg": 8,
    "weight_max_kg": 11.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "sloughi": {
    "slug": "sloughi",
    "label": "Sloughi",
    "group": "Hound",
    "size": "Large",
    "weight_min_kg": 20,
    "weight_max_kg": 27,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "slovakian_rough_haired_pointer": {
    "slug": "slovakian_rough_haired_pointer",
    "label": "Slovakian Rough Haired Pointer",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 35,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "small_munsterlander": {
    "slug": "small_munsterlander",
    "label": "Small Munsterlander",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 16,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "soft_coated_wheaten_terrier": {
    "slug": "soft_coated_wheaten_terrier",
    "label": "Soft Coated Wheaten Terrier",
    "group": "Terrier",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "american_cocker_spaniel": {
    "slug": "american_cocker_spaniel",
    "label": "American Cocker Spaniel",
    "group": "Gundog",
    "size": "Small",
    "weight_min_kg": 7,
    "weight_max_kg": 14,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "american_water_spaniel": {
    "slug": "american_water_spaniel",
    "label": "American Water Spaniel",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 11,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "clumber_spaniel": {
    "slug": "clumber_spaniel",
    "label": "Clumber Spaniel",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 39,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "cocker_spaniel": {
    "slug": "cocker_spaniel",
    "label": "Cocker Spaniel",
    "group": "Gundog",
    "size": "Small",
    "weight_min_kg": 12.5,
    "weight_max_kg": 14.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "english_springer_spaniel": {
    "slug": "english_springer_spaniel",
    "label": "English Springer Spaniel",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "field_spaniel": {
    "slug": "field_spaniel",
    "label": "Field Spaniel",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 16,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "irish_water_spaniel": {
    "slug": "irish_water_spaniel",
    "label": "Irish Water Spaniel",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "sussex_spaniel": {
    "slug": "sussex_spaniel",
    "label": "Sussex Spaniel",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 18,
    "weight_max_kg": 23,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "welsh_springer_spaniel": {
    "slug": "welsh_springer_spaniel",
    "label": "Welsh Springer Spaniel",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 16,
    "weight_max_kg": 20,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "spanish_water_dog": {
    "slug": "spanish_water_dog",
    "label": "Spanish Water Dog",
    "group": "Gundog",
    "size": "Medium",
    "weight_min_kg": 14,
    "weight_max_kg": 22,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "st_bernard": {
    "slug": "st_bernard",
    "label": "St. Bernard",
    "group": "Working",
    "size": "Extra large",
    "weight_min_kg": 54,
    "weight_max_kg": 90,
    "typical_lifespan": "Under 10 years",
    "senior_age_years": 6
  },
  "staffordshire_bull_terrier": {
    "slug": "staffordshire_bull_terrier",
    "label": "Staffordshire Bull Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 11,
    "weight_max_kg": 17,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "swedish_lapphund": {
    "slug": "swedish_lapphund",
    "label": "Swedish Lapphund",
    "group": "Pastoral",
    "size": "Medium",
    "weight_min_kg": 15,
    "weight_max_kg": 21,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "swedish_vallhund": {
    "slug": "swedish_vallhund",
    "label": "Swedish Vallhund",
    "group": "Pastoral",
    "size": "Small",
    "weight_min_kg": 9,
    "weight_max_kg": 14,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "tibetan_mastiff": {
    "slug": "tibetan_mastiff",
    "label": "Tibetan Mastiff",
    "group": "Working",
    "size": "Large",
    "weight_min_kg": 34,
    "weight_max_kg": 73,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "tibetan_spaniel": {
    "slug": "tibetan_spaniel",
    "label": "Tibetan Spaniel",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 7,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "tibetan_terrier": {
    "slug": "tibetan_terrier",
    "label": "Tibetan Terrier",
    "group": "Utility",
    "size": "Medium",
    "weight_min_kg": 8,
    "weight_max_kg": 14,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "turkish_kangal_dog": {
    "slug": "turkish_kangal_dog",
    "label": "Turkish Kangal Dog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 41,
    "weight_max_kg": 66,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "weimaraner": {
    "slug": "weimaraner",
    "label": "Weimaraner",
    "group": "Gundog",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "cardigan_welsh_corgi": {
    "slug": "cardigan_welsh_corgi",
    "label": "Cardigan Welsh Corgi",
    "group": "Pastoral",
    "size": "Small",
    "weight_min_kg": 11,
    "weight_max_kg": 17,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "pembroke_welsh_corgi": {
    "slug": "pembroke_welsh_corgi",
    "label": "Pembroke Welsh Corgi",
    "group": "Pastoral",
    "size": "Small",
    "weight_min_kg": 10,
    "weight_max_kg": 12,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "welsh_terrier": {
    "slug": "welsh_terrier",
    "label": "Welsh Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 9,
    "weight_max_kg": 9.5,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "west_highland_white_terrier": {
    "slug": "west_highland_white_terrier",
    "label": "West Highland White Terrier",
    "group": "Terrier",
    "size": "Small",
    "weight_min_kg": 6,
    "weight_max_kg": 10,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "whippet": {
    "slug": "whippet",
    "label": "Whippet",
    "group": "Hound",
    "size": "Small",
    "weight_min_kg": 9,
    "weight_max_kg": 19,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  },
  "white_swiss_shepherd_dog": {
    "slug": "white_swiss_shepherd_dog",
    "label": "White Swiss Shepherd Dog",
    "group": "Pastoral",
    "size": "Large",
    "weight_min_kg": 25,
    "weight_max_kg": 40,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "intermediate_xoloitzcuintle": {
    "slug": "intermediate_xoloitzcuintle",
    "label": "Intermediate Xoloitzcuintle",
    "group": "Utility",
    "size": "Small-Medium",
    "weight_min_kg": 9.5,
    "weight_max_kg": 16,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "miniature_xoloitzcuintle": {
    "slug": "miniature_xoloitzcuintle",
    "label": "Miniature Xoloitzcuintle",
    "group": "Utility",
    "size": "Small",
    "weight_min_kg": 4,
    "weight_max_kg": 8.5,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "standard_xoloitzcuintle": {
    "slug": "standard_xoloitzcuintle",
    "label": "Standard Xoloitzcuintle",
    "group": "Utility",
    "size": "Medium-Large",
    "weight_min_kg": 16,
    "weight_max_kg": 25,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "yakutian_laika": {
    "slug": "yakutian_laika",
    "label": "Yakutian Laika",
    "group": "Working",
    "size": "Medium-Large",
    "weight_min_kg": 20,
    "weight_max_kg": 30,
    "typical_lifespan": "Over 10 years",
    "senior_age_years": 8
  },
  "yorkshire_terrier": {
    "slug": "yorkshire_terrier",
    "label": "Yorkshire Terrier",
    "group": "Toy",
    "size": "Small",
    "weight_min_kg": 1.4,
    "weight_max_kg": 3.2,
    "typical_lifespan": "Over 12 years",
    "senior_age_years": 10
  }
};

/**
 * Explicit aliases from the app's existing intake-form breed keys (see
 * BREED_LIST in js/clinical-map.js) to this directory's slugs, since the
 * app's keys predate this dataset and don't all match its naming exactly
 * (e.g. app uses "german_shepherd", the source lists "German Shepherd Dog").
 * "poodle" has no single equivalent in the source (it lists Toy/Miniature/
 * Standard separately) — aliased to Standard Poodle as a documented default
 * since the app doesn't yet distinguish poodle size varieties.
 */
const BREED_KEY_ALIASES = {
  labrador: 'labrador_retriever',
  golden_retriever: 'golden_retriever',
  german_shepherd: 'german_shepherd_dog',
  beagle: 'beagle',
  poodle: 'standard_poodle',
};

function getBreedDirectoryEntry(breedKey) {
  if (!breedKey) return null;
  const slug = BREED_KEY_ALIASES[breedKey] || breedKey;
  return BREED_DIRECTORY[slug] || null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BREED_DIRECTORY, BREED_KEY_ALIASES, getBreedDirectoryEntry };
}

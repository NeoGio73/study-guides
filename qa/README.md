# Checking the guides

These are the scripts and results of the check described in the paper (Supporting Information S3). On October 30, 2026 every page in this repository except the Unity build was checked, the faults were fixed, and the check was run again. The scripts were written with an AI coding assistant, separately from the guides, and carry their own data tables, so that no answer is checked against the page's own answer function.

What each check does:

- **Smoke test.** Opens the page at phone width (390 px) and laptop width (1280 px), clicks every tab, button, slider and field, and records page errors, horizontal scrolling, and any NaN, undefined or Infinity in the text.
- **Generators.** Runs every problem generator thousands of times (at least 2,000 per problem type) and recomputes each answer from the question text with separate code and data, then checks that the page accepts its own displayed answer, that no named mistake is accepted, and that no problem describes something physically impossible.
- **Through the page.** Types displayed answers, rounded answers and deliberate mistakes into the real page at each help level, guided blanks included.
- **Structures.** Rebuilds every RDKit drawing into a molecule and compares its connectivity and stereochemistry with its name.

| Folder | Pages | Start with |
| --- | --- | --- |
| `genchem-a` | Moles and Molar Mass, Stoichiometry, Solutions and Titrations, Solutions and Gases | `results/summary.json` |
| `genchem-b` | Gases, Calorimetry and Hess's Law | `results.json` |
| `nonmajors-polymers` | Polarity to pH, Nuclear Chemistry and Energy, Polymers & the Surf Zone | `audit-summary.json` |
| `biochem-guides` | Carbohydrates, Lipids | `audit-summary.json` |
| `glycolysis` | Glycolysis | `check_generators.js`, `smoke.py` |
| `workbenches-organic` | Lipid, DNA and Gluconeogenesis Workbenches; Chair Lab; Stereochemistry Lab and Practice | `results.json` |
| `flashcards` | Alkene Additions and Alkyne Flashcards | `svg2mol.py`, `check_expected.py`, `functional.py` |

To run them you need Node.js, Python 3, Playwright with Chromium, and RDKit for the structure checks. The scripts were run on one machine, and the paths in them read `/path/to/study-guides`; change that to the folder where you cloned this repository. Screenshots and working copies are left out of the repository to keep it small.

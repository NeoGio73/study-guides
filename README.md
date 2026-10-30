# Interactive Chemistry Study Guides

Nineteen interactive study guides, workbenches, practice pages and flashcard decks for four college chemistry courses: General Chemistry I, chemistry for non-science majors, Organic Chemistry I, and biochemistry. Each one is a single web page that runs in any current browser, with nothing to install and no account to create.

In the calculation guides the numbers change every time, so a section can be practiced as often as you like, and most offer three levels of help: *Guided setup*, *Hints if I ask*, and *On my own*. Nothing in the guides is graded or sent anywhere. The workbenches and flashcard decks remember your place in your own browser only.

The guides were built by John Picione with a generative AI coding assistant, and checked by him and by a script that runs their problem generators. How they were built is described in a paper in preparation.

## General Chemistry I

| Guide | Sections |
| --- | --- |
| [Moles and Molar Mass](general-chemistry/mole-and-molar-mass-study-guide.html) | Molar mass · Moles and particles · Moles and mass · Mass and particles · Atoms in a compound · Mixed practice |
| [Stoichiometry](general-chemistry/stoichiometry-study-guide.html) | Mole to mole · Mass to mass · Density · Limiting reactant · Percent yield · Putting it together |
| [Solutions and Titrations](general-chemistry/solution-stoichiometry-study-guide.html) | Molarity · Dilution · Solution stoichiometry · Mixing two solutions · Titration calculations · Run a titration |
| [Solutions and Gases](general-chemistry/solutions-and-gases-study-guide.html) | Molarity · Dilution · Solution stoichiometry · Mixing two solutions · Ideal gas law · Gas stoichiometry · Solutions and gases · Putting it together |
| [Gases](general-chemistry/gases-study-guide.html) | Pressure · Boyle's law · Charles's law · Gay-Lussac's and Avogadro's laws · Combined gas law · Ideal gas law · Density and molar mass · Dalton's law · Gas stoichiometry · Kinetic molecular theory · Real gases · Mixed practice |
| [Calorimetry and Hess's Law](general-chemistry/calorimetry-and-hess-law-study-guide.html) | Heat and temperature · Heat exchange · Coffee-cup calorimetry · Thermochemical equations · Hess's law · Run an experiment |

## Chemistry for non-science majors

| Guide | Sections |
| --- | --- |
| [Polarity to pH](chemistry-for-nonmajors/polarity-to-ph-study-guide.html) | Polarity · Intermolecular forces · Solutions · Electrolytes · Acids and bases · The pH scale · Review quiz · Key terms |
| [Nuclear Chemistry and Energy](chemistry-for-nonmajors/nuclear-chemistry-and-energy-study-guide.html) | Radiation · Nuclear equations · Half-life and dating · Radioisotopes at work · Fission and fusion · Energy and reactions · Fossil fuels and electricity · Nuclear and renewable energy · Review quiz · Key terms |

## Organic Chemistry I

| Guide | Sections |
| --- | --- |
| [Chair Lab](organic-chemistry/chair-lab.html) | Explore a 3D cyclohexane chair · Read axial and equatorial positions and flip the ring · Chair challenges |
| [Stereochemistry Lab](organic-chemistry/stereochemistry-lab.html) | Explore a tetrahedral center and assign R or S · Compare two stereocenters · Challenges on enantiomers, diastereomers and meso compounds |
| [Stereochemistry Practice](organic-chemistry/stereochemistry-practice.html) | R/S and E/Z on 3D models of real molecules (ibuprofen, menthol, L-cysteine, substituted alkenes), with a results page |
| [Polymers & the Surf Zone](organic-chemistry/polymers-surf-zone.html) | Chain-growth and step-growth polymers, vinyl polymers, tacticity, rubber and copolymers, structure and properties; then what surfboards and paddleboards are made of, waves, board math, fins and rails, East Florida surf, seasons and sharks, with slider labs; a self-check with three help levels |
| [Alkene Additions Flashcards](organic-chemistry/flashcards/ch08-alkenes.html) | 94 cards on chapter 8: redox, hydrogenation, HX and Markovnikov, hydration, rearrangements, oxymercuration, hydroboration, X₂, halohydrins and more; filter by section, shuffle, mark *Got it* or *Review again* |
| [Alkyne Flashcards](organic-chemistry/flashcards/ch09-alkynes.html) | 66 cards on chapter 9: naming, making alkynes, adding X₂ and HX, hydration and tautomers, reduction, oxidative cleavage, acidity, alkylation, synthesis |

## Biochemistry

| Guide | Sections |
| --- | --- |
| [Carbohydrates](biochemistry/carbohydrates-study-guide.html) | Monosaccharides · Rings, anomers and mutarotation · Sugar derivatives and reducing sugars · Glycosidic bonds and disaccharides · Polysaccharides · Glycosaminoglycans and proteoglycans · Glycoproteins, glycolipids and lipopolysaccharides · The sugar code · Working with carbohydrates |
| [Lipids](biochemistry/lipids-study-guide.html) | Fatty acids and fats · Membrane lipids · Lipids as signals, cofactors and pigments · Working with lipids · Biological membranes · Digestion, mobilization and transport of fats · β oxidation · Ketone bodies · Fatty acid synthesis · Making triacylglycerols and membrane lipids · Cholesterol |
| [Lipid Workbench](biochemistry/lipid-workbench.html) | Build storage and membrane lipids · Cut them with phospholipases · Watch them assemble in water · Challenges |
| [DNA Workbench](biochemistry/dna-workbench.html) | Strand builder · Double helix · Melting · PCR · Restriction digest and gel · Cloning · Sanger sequencing · CRISPR–Cas9 · Applications casebook |
| [Gluconeogenesis Workbench](biochemistry/gluconeogenesis-workbench.html) | Pathway map · Why bypass? · Compartments · What can become glucose? · Energy ledger · Reciprocal regulation · Fed vs. fasted · Cori and glucose–alanine cycles · Applications casebook |

## The first experiment: a guide built in a game engine

| Guide | Sections |
| --- | --- |
| [Substitution and Elimination (Unity)](organic-chemistry/substitution-elimination-unity/) | Overview · S<sub>N</sub>2 · S<sub>N</sub>1 · E2 · E1 · Solvents and reagents · Decision tool · Practice |

Organic Chemistry I, following McMurry, *Organic Chemistry*, Chapter 11. This was the first guide, built in September 2026 in the Unity game engine while the same workflow was being used for virtual laboratories. It works, with 3D models of backside attack and anti-periplanar elimination, but it is kept here mainly as a record of why the later guides are plain web pages: it downloads about 35 MB and needs WebGL 2, its text is drawn into the game canvas (so it cannot be selected, searched, or read by a screen reader), and changing one word means rebuilding it in the Unity editor.

## For instructors

- **Each guide is one HTML file** with its styles and code inside it (except the Unity experiment above, a compiled WebGL build; the two stereochemistry pages also load JSmol from the `organic-chemistry/jsmol/` folder). Link it from any learning management system, or open it in a text editor and change it. Most load nothing from other sites; the polymers guide, two of the workbenches and the flashcard decks load their fonts from Google Fonts.
- **3D viewers.** Chair Lab embeds [3Dmol.js](https://3dmol.org/) (BSD license). The stereochemistry pages use [JSmol](https://jmol.sourceforge.net/) (Jmol 16.5.5, LGPL), bundled in `organic-chemistry/jsmol/` (the HTML5 part only), so they load nothing from other sites; their structures were generated with RDKit and checked for the stated configurations.
- **Sources.** The organic pages cite the sections of OpenStax *Organic Chemistry* they follow: chapter 4 (cyclohexane), chapter 5 (stereochemistry), and chapters 8 and 9 (the flashcard decks, which follow the class notes for those chapters). The biochemistry pages follow Lehninger *Principles of Biochemistry* for names and values; the carbohydrates and lipids guides also draw on the *Color Atlas of Biochemistry*. The polymers guide follows OpenStax *Organic Chemistry* (chapter 31 and section 8.10), and its structures were drawn with [RDKit](https://www.rdkit.org/).
- **Credits in the polymers guide.** Photographs: Mavericks by Shalom Jacobovitz ([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)) and Teahupo'o by Olivier Dugornay / Ifremer ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), both resized. The Mavericks bathymetry map is from the U.S. Geological Survey with the CSUMB Seafloor Mapping Lab. The guide links to two wave games that live in another repository.
- **Other copies.** Each guide also lives in its own course's repository, where the course links to it. This repository is the complete set, and it will be tagged at the version described in the paper.

## License

Code and text are under the [MIT License](LICENSE). 3Dmol.js and JSmol keep their own licenses (BSD and LGPL). The photographs and the map in the polymers guide are not; their credits and licenses are listed above and in the guide.

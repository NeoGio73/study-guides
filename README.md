# Interactive Chemistry Study Guides

Fourteen interactive study guides and workbenches for four college chemistry courses: General Chemistry I, chemistry for non-science majors, Organic Chemistry I, and biochemistry. Each one is a single web page that runs in any current browser, with nothing to install and no account to create.

In the calculation guides the numbers change every time, so a section can be practiced as often as you like, and most offer three levels of help: *Guided setup*, *Hints if I ask*, and *On my own*. Nothing in the guides is graded or sent anywhere. The workbenches remember your place in your own browser only.

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
| [Polymers & the Surf Zone](organic-chemistry/polymers-surf-zone.html) | Chain-growth and step-growth polymers, vinyl polymers, tacticity, rubber and copolymers, structure and properties; then what surfboards and paddleboards are made of, waves, board math, fins and rails, East Florida surf, seasons and sharks, with slider labs; a self-check with three help levels |

## Biochemistry

| Guide | Sections |
| --- | --- |
| [Carbohydrates](biochemistry/carbohydrates-study-guide.html) | Monosaccharides · Rings, anomers and mutarotation · Sugar derivatives and reducing sugars · Glycosidic bonds and disaccharides · Polysaccharides · Glycosaminoglycans and proteoglycans · Glycoproteins, glycolipids and lipopolysaccharides · The sugar code · Working with carbohydrates |
| [Lipids](biochemistry/lipids-study-guide.html) | Fatty acids and fats · Membrane lipids · Lipids as signals, cofactors and pigments · Working with lipids · Biological membranes · Digestion, mobilization and transport of fats · β oxidation · Ketone bodies · Fatty acid synthesis · Making triacylglycerols and membrane lipids · Cholesterol |
| [Lipid Workbench](biochemistry/lipid-workbench.html) | Build storage and membrane lipids · Cut them with phospholipases · Watch them assemble in water · Challenges |
| [DNA Workbench](biochemistry/dna-workbench.html) | Strand builder · Double helix · Melting · PCR · Restriction digest and gel · Cloning · Sanger sequencing · CRISPR–Cas9 · Applications casebook |
| [Gluconeogenesis Workbench](biochemistry/gluconeogenesis-workbench.html) | Pathway map · Why bypass? · Compartments · What can become glucose? · Energy ledger · Reciprocal regulation · Fed vs. fasted · Cori and glucose–alanine cycles · Applications casebook |

## For instructors

- **Each guide is one HTML file** with its styles and code inside it. Link it from any learning management system, or open it in a text editor and change it. Most load nothing from other sites; the polymers guide and two of the workbenches load their fonts from Google Fonts.
- **Sources.** The biochemistry pages follow Lehninger *Principles of Biochemistry* for names and values; the carbohydrates and lipids guides also draw on the *Color Atlas of Biochemistry*. The polymers guide follows OpenStax *Organic Chemistry* (chapter 31 and section 8.10), and its structures were drawn with [RDKit](https://www.rdkit.org/).
- **Credits in the polymers guide.** Photographs: Mavericks by Shalom Jacobovitz ([CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)) and Teahupo'o by Olivier Dugornay / Ifremer ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)), both resized. The Mavericks bathymetry map is from the U.S. Geological Survey with the CSUMB Seafloor Mapping Lab. The guide links to two wave games that live in another repository.
- **Other copies.** Each guide also lives in its own course's repository, where the course links to it. This repository is the complete set, and it will be tagged at the version described in the paper.

## License

Code and text are under the [MIT License](LICENSE). The photographs and the map in the polymers guide are not; their credits and licenses are listed above and in the guide.

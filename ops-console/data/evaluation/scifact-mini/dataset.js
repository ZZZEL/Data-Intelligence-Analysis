(function registerSciFactMini(global) {
  "use strict";

  var app = (global.OpsDemo = global.OpsDemo || {});
  var data = (app.data = app.data || {});

  // Frozen, local-only subset of the official SciFact development data.
  // Attribution and license details live beside this file in README.md.
  data.scifactMini = {
  "id": "SCIFACT-MINI-V1",
  "name": "SciFact Mini 检索评测集",
  "corpusVersion": "scifact-release-latest-mini-v1",
  "language": "英文",
  "caseCount": 6,
  "documentCount": 11,
  "corpus": [
    {
      "id": "SF-DOC-5953485",
      "sourceDocumentId": "5953485",
      "title": "ADAR1 Forms a Complex with Dicer to Promote MicroRNA Processing and RNA-Induced Gene Silencing",
      "abstract": [
        "Adenosine deaminases acting on RNA (ADARs) are involved in RNA editing that converts adenosine residues to inosine specifically in double-stranded RNAs.",
        "In this study, we investigated the interaction of the RNA editing mechanism with the RNA interference (RNAi) machinery and found that ADAR1 forms a complex with Dicer through direct protein-protein interaction.",
        "Most importantly, ADAR1 increases the maximum rate (Vmax) of pre-microRNA (miRNA) cleavage by Dicer and facilitates loading of miRNA onto RNA-induced silencing complexes, identifying a new role of ADAR1 in miRNA processing and RNAi mechanisms.",
        "ADAR1 differentiates its functions in RNA editing and RNAi by the formation of either ADAR1/ADAR1 homodimer or Dicer/ADAR1 heterodimer complexes, respectively.",
        "As expected, the expression of miRNAs is globally inhibited in ADAR1(-/-) mouse embryos, which, in turn, alters the expression of their target genes and might contribute to their embryonic lethal phenotype."
      ]
    },
    {
      "id": "SF-DOC-5956380",
      "sourceDocumentId": "5956380",
      "title": "Exome sequencing identifies somatic gain-of-function PPM1D mutations in brainstem gliomas",
      "abstract": [
        "Gliomas arising in the brainstem and thalamus are devastating tumors that are difficult to surgically resect.",
        "To determine the genetic and epigenetic landscape of these tumors, we performed exomic sequencing of 14 brainstem gliomas (BSGs) and 12 thalamic gliomas.",
        "We also performed targeted mutational analysis of an additional 24 such tumors and genome-wide methylation profiling of 45 gliomas.",
        "This study led to the discovery of tumor-specific mutations in PPM1D, encoding wild-type p53-induced protein phosphatase 1D (WIP1), in 37.5% of the BSGs that harbored hallmark H3F3A mutations encoding p.",
        "Lys27Met substitutions.",
        "PPM1D mutations were mutually exclusive with TP53 mutations in BSG and attenuated p53 activation in vitro.",
        "PPM1D mutations were truncating alterations in exon 6 that enhanced the ability of PPM1D to suppress the activation of the DNA damage response checkpoint protein CHK2.",
        "These results define PPM1D as a frequent target of somatic mutation and as a potential therapeutic target in brainstem gliomas."
      ]
    },
    {
      "id": "SF-DOC-4414547",
      "sourceDocumentId": "4414547",
      "title": "Mosaic PPM1D mutations are associated with predisposition to breast and ovarian cancer",
      "abstract": [
        "Improved sequencing technologies offer unprecedented opportunities for investigating the role of rare genetic variation in common disease.",
        "However, there are considerable challenges with respect to study design, data analysis and replication.",
        "Using pooled next-generation sequencing of 507 genes implicated in the repair of DNA in 1,150 samples, an analytical strategy focused on protein-truncating variants (PTVs) and a large-scale sequencing case–control replication experiment in 13,642 individuals, here we show that rare PTVs in the p53-inducible protein phosphatase PPM1D are associated with predisposition to breast cancer and ovarian cancer.",
        "PPM1D PTV mutations were present in 25 out of 7,781 cases versus 1 out of 5,861 controls (P = 1.12 × 10−5), including 18 mutations in 6,912 individuals with breast cancer (P = 2.42 × 10−4) and 12 mutations in 1,121 individuals with ovarian cancer (P = 3.10 × 10−9).",
        "Notably, all of the identified PPM1D PTVs were mosaic in lymphocyte DNA and clustered within a 370-base-pair region in the final exon of the gene, carboxy-terminal to the phosphatase catalytic domain.",
        "Functional studies demonstrate that the mutations result in enhanced suppression of p53 in response to ionizing radiation exposure, suggesting that the mutant alleles encode hyperactive PPM1D isoforms.",
        "Thus, although the mutations cause premature protein truncation, they do not result in the simple loss-of-function effect typically associated with this class of variant, but instead probably have a gain-of-function effect.",
        "Our results have implications for the detection and management of breast and ovarian cancer risk.",
        "More generally, these data provide new insights into the role of rare and of mosaic genetic variants in common conditions, and the use of sequencing in their identification."
      ]
    },
    {
      "id": "SF-DOC-33872649",
      "sourceDocumentId": "33872649",
      "title": "Secondary aerosolization of viable Bacillus anthracis spores in a contaminated US Senate Office.",
      "abstract": [
        "CONTEXT Bioterrorist attacks involving letters and mail-handling systems in Washington, DC, resulted in Bacillus anthracis (anthrax) spore contamination in the Hart Senate Office Building and other facilities in the US Capitol's vicinity.   \n",
        "OBJECTIVE To provide information about the nature and extent of indoor secondary aerosolization of B anthracis spores.   \n",
        "DESIGN Stationary and personal air samples, surface dust, and swab samples were collected under semiquiescent (minimal activities) and then simulated active office conditions to estimate secondary aerosolization of B anthracis spores.",
        "Nominal size characteristics, airborne concentrations, and surface contamination of B anthracis particles (colony-forming units) were evaluated.   \n",
        "RESULTS Viable B anthracis spores reaerosolized under semiquiescent conditions, with a marked increase in reaerosolization during simulated active office conditions.",
        "Increases were observed for B anthracis collected on open sheep blood agar plates (P<.001) and personal air monitors (P =.01) during active office conditions.",
        "More than 80% of the B anthracis particles collected on stationary monitors were within an alveolar respirable size range of 0.95 to 3.5 micro m.   CONCLUSIONS Bacillus anthracis spores used in a recent terrorist incident reaerosolized under common office activities.",
        "These findings have important implications for appropriate respiratory protection, remediation, and reoccupancy of contaminated office environments."
      ]
    },
    {
      "id": "SF-DOC-6372244",
      "sourceDocumentId": "6372244",
      "title": "Antibiotic-induced shifts in the mouse gut microbiome and metabolome increase susceptibility to Clostridium difficile infection",
      "abstract": [
        "Antibiotics can have significant and long-lasting effects on the gastrointestinal tract microbiota, reducing colonization resistance against pathogens including Clostridium difficile.",
        "Here we show that antibiotic treatment induces substantial changes in the gut microbial community and in the metabolome of mice susceptible to C. difficile infection.",
        "Levels of secondary bile acids, glucose, free fatty acids and dipeptides decrease, whereas those of primary bile acids and sugar alcohols increase, reflecting the modified metabolic activity of the altered gut microbiome.",
        "In vitro and ex vivo analyses demonstrate that C. difficile can exploit specific metabolites that become more abundant in the mouse gut after antibiotics, including the primary bile acid taurocholate for germination, and carbon sources such as mannitol, fructose, sorbitol, raffinose and stachyose for growth.",
        "Our results indicate that antibiotic-mediated alteration of the gut microbiome converts the global metabolic profile to one that favours C. difficile germination and growth."
      ]
    },
    {
      "id": "SF-DOC-4883040",
      "sourceDocumentId": "4883040",
      "title": "Antiretroviral Therapy for Prevention of Tuberculosis in Adults with HIV: A Systematic Review and Meta-Analysis",
      "abstract": [
        "BACKGROUND Human immunodeficiency virus (HIV) infection is the strongest risk factor for developing tuberculosis and has fuelled its resurgence, especially in sub-Saharan Africa.",
        "In 2010, there were an estimated 1.1 million incident cases of tuberculosis among the 34 million people living with HIV worldwide.",
        "Antiretroviral therapy has substantial potential to prevent HIV-associated tuberculosis.",
        "We conducted a systematic review of studies that analysed the impact of antiretroviral therapy on the incidence of tuberculosis in adults with HIV infection.   \n",
        "METHODS AND FINDINGS PubMed, Embase, African Index Medicus, LILACS, and clinical trial registries were systematically searched.",
        "Randomised controlled trials, prospective cohort studies, and retrospective cohort studies were included if they compared tuberculosis incidence by antiretroviral therapy status in HIV-infected adults for a median of over 6 mo in developing countries.",
        "For the meta-analyses there were four categories based on CD4 counts at antiretroviral therapy initiation: (1) less than 200 cells/µl, (2) 200 to 350 cells/µl, (3) greater than 350 cells/µl, and (4) any CD4 count.",
        "Eleven studies met the inclusion criteria.",
        "Antiretroviral therapy is strongly associated with a reduction in the incidence of tuberculosis in all baseline CD4 count categories: (1) less than 200 cells/µl (hazard ratio [HR] 0.16, 95% confidence interval [CI] 0.07 to 0.36), (2) 200 to 350 cells/µl (HR 0.34, 95% CI 0.19 to 0.60), (3) greater than 350 cells/µl (HR 0.43, 95% CI 0.30 to 0.63), and (4) any CD4 count (HR 0.35, 95% CI 0.28 to 0.44).",
        "There was no evidence of hazard ratio modification with respect to baseline CD4 count category (p = 0.20).   \n",
        "CONCLUSIONS Antiretroviral therapy is strongly associated with a reduction in the incidence of tuberculosis across all CD4 count strata.",
        "Earlier initiation of antiretroviral therapy may be a key component of global and national strategies to control the HIV-associated tuberculosis syndemic.   ",
        "REVIEW REGISTRATION International Prospective Register of Systematic Reviews CRD42011001209 Please see later in the article for the Editors' Summary."
      ]
    },
    {
      "id": "SF-DOC-45638119",
      "sourceDocumentId": "45638119",
      "title": "ALDH1 is a marker of normal and malignant human mammary stem cells and a predictor of poor clinical outcome.",
      "abstract": [
        "Application of stem cell biology to breast cancer research has been limited by the lack of simple methods for identification and isolation of normal and malignant stem cells.",
        "Utilizing in vitro and in vivo experimental systems, we show that normal and cancer human mammary epithelial cells with increased aldehyde dehydrogenase activity (ALDH) have stem/progenitor properties.",
        "These cells contain the subpopulation of normal breast epithelium with the broadest lineage differentiation potential and greatest growth capacity in a xenotransplant model.",
        "In breast carcinomas, high ALDH activity identifies the tumorigenic cell fraction, capable of self-renewal and of generating tumors that recapitulate the heterogeneity of the parental tumor.",
        "In a series of 577 breast carcinomas, expression of ALDH1 detected by immunostaining correlated with poor prognosis.",
        "These findings offer an important new tool for the study of normal and malignant breast stem cells and facilitate the clinical application of stem cell concepts."
      ]
    },
    {
      "id": "SF-DOC-13734012",
      "sourceDocumentId": "13734012",
      "title": "Prevalent abnormal prion protein in human appendixes after bovine spongiform encephalopathy epizootic: large scale survey",
      "abstract": [
        "OBJECTIVES To carry out a further survey of archived appendix samples to understand better the differences between existing estimates of the prevalence of subclinical infection with prions after the bovine spongiform encephalopathy epizootic and to see whether a broader birth cohort was affected, and to understand better the implications for the management of blood and blood products and for the handling of surgical instruments.   \n",
        "DESIGN Irreversibly unlinked and anonymised large scale survey of archived appendix samples.   \n",
        "SETTING Archived appendix samples from the pathology departments of 41 UK hospitals participating in the earlier survey, and additional hospitals in regions with lower levels of participation in that survey.   ",
        "SAMPLE 32,441 archived appendix samples fixed in formalin and embedded in paraffin and tested for the presence of abnormal prion protein (PrP).   \n",
        "RESULTS Of the 32,441 appendix samples 16 were positive for abnormal PrP, indicating an overall prevalence of 493 per million population (95% confidence interval 282 to 801 per million).",
        "The prevalence in those born in 1941-60 (733 per million, 269 to 1596 per million) did not differ significantly from those born between 1961 and 1985 (412 per million, 198 to 758 per million) and was similar in both sexes and across the three broad geographical areas sampled.",
        "Genetic testing of the positive specimens for the genotype at PRNP codon 129 revealed a high proportion that were valine homozygous compared with the frequency in the normal population, and in stark contrast with confirmed clinical cases of vCJD, all of which were methionine homozygous at PRNP codon 129.   \n",
        "CONCLUSIONS This study corroborates previous studies and suggests a high prevalence of infection with abnormal PrP, indicating vCJD carrier status in the population compared with the 177 vCJD cases to date.",
        "These findings have important implications for the management of blood and blood products and for the handling of surgical instruments."
      ]
    },
    {
      "id": "SF-DOC-14717500",
      "sourceDocumentId": "14717500",
      "title": "Rare Variants Create Synthetic Genome-Wide Associations",
      "abstract": [
        "Genome-wide association studies (GWAS) have now identified at least 2,000 common variants that appear associated with common diseases or related traits (http://www.genome.gov/gwastudies), hundreds of which have been convincingly replicated.",
        "It is generally thought that the associated markers reflect the effect of a nearby common (minor allele frequency >0.05) causal site, which is associated with the marker, leading to extensive resequencing efforts to find causal sites.",
        "We propose as an alternative explanation that variants much less common than the associated one may create \"synthetic associations\" by occurring, stochastically, more often in association with one of the alleles at the common site versus the other allele.",
        "Although synthetic associations are an obvious theoretical possibility, they have never been systematically explored as a possible explanation for GWAS findings.",
        "Here, we use simple computer simulations to show the conditions under which such synthetic associations will arise and how they may be recognized.",
        "We show that they are not only possible, but inevitable, and that under simple but reasonable genetic models, they are likely to account for or contribute to many of the recently identified signals reported in genome-wide association studies.",
        "We also illustrate the behavior of synthetic associations in real datasets by showing that rare causal mutations responsible for both hearing loss and sickle cell anemia create genome-wide significant synthetic associations, in the latter case extending over a 2.5-Mb interval encompassing scores of \"blocks\" of associated variants.",
        "In conclusion, uncommon or rare genetic variants can easily create synthetic associations that are credited to common variants, and this possibility requires careful consideration in the interpretation and follow up of GWAS signals."
      ]
    },
    {
      "id": "SF-DOC-4709641",
      "sourceDocumentId": "4709641",
      "title": "Gain of toxic Apolipoprotein E4 effects in Human iPSC-Derived Neurons Is Ameliorated by a Small-Molecule Structure Corrector",
      "abstract": [
        "Efforts to develop drugs for Alzheimer's disease (AD) have shown promise in animal studies, only to fail in human trials, suggesting a pressing need to study AD in human model systems.",
        "Using human neurons derived from induced pluripotent stem cells that expressed apolipoprotein E4 (ApoE4), a variant of the APOE gene product and the major genetic risk factor for AD, we demonstrated that ApoE4-expressing neurons had higher levels of tau phosphorylation, unrelated to their increased production of amyloid-β (Aβ) peptides, and that they displayed GABAergic neuron degeneration.",
        "ApoE4 increased Aβ production in human, but not in mouse, neurons.",
        "Converting ApoE4 to ApoE3 by gene editing rescued these phenotypes, indicating the specific effects of ApoE4.",
        "Neurons that lacked APOE behaved similarly to those expressing ApoE3, and the introduction of ApoE4 expression recapitulated the pathological phenotypes, suggesting a gain of toxic effects from ApoE4.",
        "Treatment of ApoE4-expressing neurons with a small-molecule structure corrector ameliorated the detrimental effects, thus showing that correcting the pathogenic conformation of ApoE4 is a viable therapeutic approach for ApoE4-related AD."
      ]
    },
    {
      "id": "SF-DOC-49556906",
      "sourceDocumentId": "49556906",
      "title": "Metformin reverses established lung fibrosis in a bleomycin model",
      "abstract": [
        "Fibrosis is a pathological result of a dysfunctional repair response to tissue injury and occurs in a number of organs, including the lungs1.",
        "Cellular metabolism regulates tissue repair and remodelling responses to injury2-4.",
        "AMPK is a critical sensor of cellular bioenergetics and controls the switch from anabolic to catabolic metabolism5.",
        "However, the role of AMPK in fibrosis is not well understood.",
        "Here, we demonstrate that in humans with idiopathic pulmonary fibrosis (IPF) and in an experimental mouse model of lung fibrosis, AMPK activity is lower in fibrotic regions associated with metabolically active and apoptosis-resistant myofibroblasts.",
        "Pharmacological activation of AMPK in myofibroblasts from lungs of humans with IPF display lower fibrotic activity, along with enhanced mitochondrial biogenesis and normalization of sensitivity to apoptosis.",
        "In a bleomycin model of lung fibrosis in mice, metformin therapeutically accelerates the resolution of well-established fibrosis in an AMPK-dependent manner.",
        "These studies implicate deficient AMPK activation in non-resolving, pathologic fibrotic processes, and support a role for metformin (or other AMPK activators) to reverse established fibrosis by facilitating deactivation and apoptosis of myofibroblasts."
      ]
    }
  ],
  "cases": [
    {
      "id": "SF-Q-49",
      "sourceClaimId": "49",
      "query": "ADAR1 binds to Dicer to cleave pre-miRNA.",
      "goldDocumentIds": [
        "SF-DOC-5953485"
      ],
      "goldSentenceIndexes": {
        "SF-DOC-5953485": [
          1,
          2
        ]
      },
      "fusionOrder": [
        "SF-DOC-4709641",
        "SF-DOC-5953485",
        "SF-DOC-14717500",
        "SF-DOC-49556906",
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-13734012",
        "SF-DOC-33872649"
      ],
      "rerankOrder": [
        "SF-DOC-5953485",
        "SF-DOC-4709641",
        "SF-DOC-14717500",
        "SF-DOC-49556906",
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-13734012",
        "SF-DOC-33872649"
      ]
    },
    {
      "id": "SF-Q-70",
      "sourceClaimId": "70",
      "query": "Activation of PPM1D suppresses p53 function.",
      "goldDocumentIds": [
        "SF-DOC-5956380",
        "SF-DOC-4414547"
      ],
      "goldSentenceIndexes": {
        "SF-DOC-5956380": [
          5,
          6
        ],
        "SF-DOC-4414547": [
          5
        ]
      },
      "fusionOrder": [
        "SF-DOC-4414547",
        "SF-DOC-5956380",
        "SF-DOC-45638119",
        "SF-DOC-49556906",
        "SF-DOC-4709641",
        "SF-DOC-14717500",
        "SF-DOC-5953485",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-13734012",
        "SF-DOC-33872649"
      ],
      "rerankOrder": [
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-49556906",
        "SF-DOC-4709641",
        "SF-DOC-14717500",
        "SF-DOC-5953485",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-13734012",
        "SF-DOC-4414547",
        "SF-DOC-33872649"
      ]
    },
    {
      "id": "SF-Q-115",
      "sourceClaimId": "115",
      "query": "Anthrax spores can be disposed of easily after they are dispersed.",
      "goldDocumentIds": [
        "SF-DOC-33872649"
      ],
      "goldSentenceIndexes": {
        "SF-DOC-33872649": [
          6
        ]
      },
      "fusionOrder": [
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-33872649",
        "SF-DOC-13734012",
        "SF-DOC-49556906",
        "SF-DOC-5953485",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-45638119",
        "SF-DOC-14717500",
        "SF-DOC-4709641"
      ],
      "rerankOrder": [
        "SF-DOC-33872649",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-13734012",
        "SF-DOC-49556906",
        "SF-DOC-5953485",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-45638119",
        "SF-DOC-14717500",
        "SF-DOC-4709641"
      ]
    },
    {
      "id": "SF-Q-118",
      "sourceClaimId": "118",
      "query": "Antibiotic induced alterations in the gut microbiome reduce resistance against Clostridium difficile.",
      "goldDocumentIds": [
        "SF-DOC-6372244"
      ],
      "goldSentenceIndexes": {
        "SF-DOC-6372244": [
          0,
          4
        ]
      },
      "fusionOrder": [
        "SF-DOC-6372244",
        "SF-DOC-33872649",
        "SF-DOC-4883040",
        "SF-DOC-49556906",
        "SF-DOC-5953485",
        "SF-DOC-13734012",
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-14717500",
        "SF-DOC-4709641"
      ],
      "rerankOrder": [
        "SF-DOC-6372244",
        "SF-DOC-33872649",
        "SF-DOC-4883040",
        "SF-DOC-49556906",
        "SF-DOC-5953485",
        "SF-DOC-13734012",
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-14717500",
        "SF-DOC-4709641"
      ]
    },
    {
      "id": "SF-Q-124",
      "sourceClaimId": "124",
      "query": "Antiretroviral therapy reduces rates of tuberculosis across a broad range of CD4 strata.",
      "goldDocumentIds": [
        "SF-DOC-4883040"
      ],
      "goldSentenceIndexes": {
        "SF-DOC-4883040": [
          8,
          10
        ]
      },
      "fusionOrder": [
        "SF-DOC-49556906",
        "SF-DOC-4883040",
        "SF-DOC-6372244",
        "SF-DOC-13734012",
        "SF-DOC-33872649",
        "SF-DOC-4709641",
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-5953485",
        "SF-DOC-14717500"
      ],
      "rerankOrder": [
        "SF-DOC-4883040",
        "SF-DOC-49556906",
        "SF-DOC-6372244",
        "SF-DOC-13734012",
        "SF-DOC-33872649",
        "SF-DOC-4709641",
        "SF-DOC-45638119",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-5953485",
        "SF-DOC-14717500"
      ]
    },
    {
      "id": "SF-Q-53",
      "sourceClaimId": "53",
      "query": "ALDH1 expression is associated with poorer prognosis in breast cancer.",
      "goldDocumentIds": [
        "SF-DOC-45638119"
      ],
      "goldSentenceIndexes": {
        "SF-DOC-45638119": [
          4
        ]
      },
      "fusionOrder": [
        "SF-DOC-4709641",
        "SF-DOC-49556906",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-45638119",
        "SF-DOC-13734012",
        "SF-DOC-14717500",
        "SF-DOC-5953485",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-33872649"
      ],
      "rerankOrder": [
        "SF-DOC-45638119",
        "SF-DOC-4709641",
        "SF-DOC-49556906",
        "SF-DOC-5956380",
        "SF-DOC-4414547",
        "SF-DOC-13734012",
        "SF-DOC-14717500",
        "SF-DOC-5953485",
        "SF-DOC-6372244",
        "SF-DOC-4883040",
        "SF-DOC-33872649"
      ]
    }
  ]
};
})(window);

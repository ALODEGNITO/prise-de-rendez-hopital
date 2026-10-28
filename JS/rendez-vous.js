const form = document.getElementById("appointmentForm");
const analysesSection = document.getElementById("analysesSection");
const typeInputs = document.querySelectorAll('input[name="typeRendezVous"]');
const formAlert = document.getElementById("formAlert");
const analysisIds = ["analyse1", "analyse2", "analyse3"];
const analysesStatus = document.getElementById("analysesStatus");
const analysesApiUrl = "https://gdorapis.com/api/WOTTICAANAL";
const appointmentsApiUrl = "https://gdorapis.com/api/WOTTICARESER";
let analysesLoaded = false;
let analysesLoadPromise = null;
let isSubmitting = false;
const appointmentDateInput = document.getElementById("dateRendezVous");
const submitButton = form.querySelector('button[type="submit"]');
const submitButtonLabel = submitButton.querySelector("span");

const fieldIds = ["nom", "prenom", "sexe", "age", "adresse", "telephone", "dateRendezVous"];
const uppercaseFieldIds = ["nom", "prenom", "adresse"];
const errorMessages = {
  nom: "Veuillez saisir votre nom.",
  prenom: "Veuillez saisir votre prénom.",
  sexe: "Veuillez sélectionner une option.",
  age: "Veuillez saisir un âge valide entre 0 et 120 ans.",
  adresse: "Veuillez renseigner votre adresse ou votre quartier.",
  telephone: "Veuillez saisir un numéro de téléphone valide.",
  dateRendezVous: "Veuillez choisir aujourd’hui ou une date à venir.",
  analyse1: "Veuillez sélectionner au moins une analyse."
};

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateMinimumAppointmentDate() {
  appointmentDateInput.min = getLocalDateValue();
}

updateMinimumAppointmentDate();

function selectedType() {
  return document.querySelector('input[name="typeRendezVous"]:checked')?.value || "";
}

async function loadAnalyses() {
  if (analysesLoaded || analysesLoadPromise) return analysesLoadPromise;

  analysisIds.forEach((id) => {
    const select = document.getElementById(id);
    select.disabled = true;
    select.innerHTML = '<option value="">Chargement des analyses...</option>';
  });
  analysesStatus.textContent = "Chargement des analyses...";

  analysesLoadPromise = (async () => {
    try {
      const response = await fetch(analysesApiUrl);
      if (!response.ok) {
        throw new Error(`La requête a échoué (HTTP ${response.status}).`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("La réponse de l’API n’a pas le format attendu.");
      }

      const analyses = data.filter((analysis) =>
        analysis &&
        typeof analysis.codean === "string" &&
        analysis.codean.trim() &&
        typeof analysis.libcan === "string" &&
        analysis.libcan.trim()
      );

      if (analyses.length === 0) {
        throw new Error("Aucune analyse valide n’a été reçue.");
      }

      analysisIds.forEach((id) => {
        const select = document.getElementById(id);
        select.replaceChildren(new Option("Veuillez sélectionner", ""));
        analyses.forEach((analysis) => {
          select.add(new Option(analysis.libcan.trim(), analysis.codean.trim()));
        });
        select.disabled = false;
      });

      analysesLoaded = true;
      analysesStatus.textContent = `${analyses.length} analyses disponibles.`;
    } catch (error) {
      console.error("Impossible de charger les analyses :", error);
      analysisIds.forEach((id) => {
        const select = document.getElementById(id);
        select.replaceChildren(new Option("Analyses indisponibles", ""));
        select.disabled = true;
      });
      analysesStatus.textContent =
        "Impossible de charger les analyses. Vérifiez votre connexion puis choisissez à nouveau le type « Analyse » pour réessayer.";
      analysesLoadPromise = null;
    }
  })();

  return analysesLoadPromise;
}

function toggleAnalyses() {
  const isAnalysis = selectedType() === "Analyse";
  analysesSection.hidden = !isAnalysis;

  if (isAnalysis) {
    loadAnalyses();
  } else {
    analysisIds.forEach((id) => {
      const input = document.getElementById(id);
      input.value = "";
      input.removeAttribute("aria-invalid");
    });
    clearError("analyse1");
  }
}

typeInputs.forEach((input) => input.addEventListener("change", () => {
  toggleAnalyses();
  clearError("typeRendezVous");
}));

function setError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}Error`);
  if (input) input.setAttribute("aria-invalid", "true");
  if (error) error.textContent = message;
}

function clearError(id) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}Error`);
  if (input) input.removeAttribute("aria-invalid");
  if (error) error.textContent = "";
}

function uppercaseFieldValue(input) {
  const selectionStart = input.selectionStart;
  const uppercaseValue = input.value.toLocaleUpperCase("fr-FR");

  if (input.value !== uppercaseValue) {
    const cursorPosition = selectionStart === null
      ? null
      : input.value.slice(0, selectionStart).toLocaleUpperCase("fr-FR").length;
    input.value = uppercaseValue;
    if (cursorPosition !== null) {
      input.setSelectionRange(cursorPosition, cursorPosition);
    }
  }
}

function keepDigitsOnly(input) {
  const selectionStart = input.selectionStart;
  const digitsBeforeCursor = selectionStart === null
    ? null
    : input.value.slice(0, selectionStart).replace(/[^0-9]/g, "").length;
  const digitsOnly = input.value.replace(/[^0-9]/g, "");

  if (input.value !== digitsOnly) {
    input.value = digitsOnly;
    if (digitsBeforeCursor !== null) {
      input.setSelectionRange(digitsBeforeCursor, digitsBeforeCursor);
    }
  }
}

fieldIds.forEach((id) => {
  const input = document.getElementById(id);
  input.addEventListener("input", () => {
    if (uppercaseFieldIds.includes(id)) {
      uppercaseFieldValue(input);
    } else if (id === "telephone") {
      keepDigitsOnly(input);
    }
    clearError(id);
  });
  input.addEventListener("change", () => clearError(id));
});

analysisIds.forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    if (analysisIds.some((analysisId) => document.getElementById(analysisId).value)) {
      clearError("analyse1");
    }
  });
});

document.getElementById("confirmation").addEventListener("change", () => {
  document.getElementById("confirmationError").textContent = "";
});

function validateForm() {
  let valid = true;
  fieldIds.forEach(clearError);
  clearError("analyse1");
  updateMinimumAppointmentDate();

  const values = {
    nom: document.getElementById("nom").value.trim(),
    prenom: document.getElementById("prenom").value.trim(),
    sexe: document.getElementById("sexe").value,
    age: document.getElementById("age").value,
    adresse: document.getElementById("adresse").value.trim(),
    telephone: document.getElementById("telephone").value.trim()
  };

  ["nom", "prenom", "sexe", "adresse"].forEach((id) => {
    if (!values[id]) {
      setError(id, errorMessages[id]);
      valid = false;
    }
  });

  if (!appointmentDateInput.value || appointmentDateInput.value < appointmentDateInput.min) {
    setError("dateRendezVous", errorMessages.dateRendezVous);
    valid = false;
  }

  const age = Number(values.age);
  if (values.age === "" || !Number.isInteger(age) || age < 0 || age > 120) {
    setError("age", errorMessages.age);
    valid = false;
  }

  // Validation souple : accepte les espaces et les préfixes internationaux.
  const digits = values.telephone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    setError("telephone", errorMessages.telephone);
    valid = false;
  }

  if (!selectedType()) {
    document.getElementById("typeRendezVousError").textContent =
      "Veuillez choisir le type de rendez-vous.";
    valid = false;
  } else {
    document.getElementById("typeRendezVousError").textContent = "";
  }

  if (selectedType() === "Analyse") {
    if (!analysesLoaded) {
      valid = false;
    } else if (!analysisIds.some((id) => document.getElementById(id).value)) {
      setError("analyse1", errorMessages.analyse1);
      valid = false;
    }
  }

  const confirmation = document.getElementById("confirmation");
  if (!confirmation.checked) {
    document.getElementById("confirmationError").textContent =
      "Veuillez confirmer l’exactitude des informations.";
    valid = false;
  }

  return valid;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  formAlert.hidden = true;
  formAlert.className = "form-alert";

  uppercaseFieldIds.forEach((id) => {
    const input = document.getElementById(id);
    input.value = input.value.toLocaleUpperCase("fr-FR");
  });

  if (!validateForm()) {
    formAlert.textContent = "Veuillez vérifier les champs signalés avant de continuer.";
    formAlert.classList.add("error");
    formAlert.hidden = false;
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const dateRendezVous = appointmentDateInput.value;
  const request = {
    TELCN: `+229${document.getElementById("telephone").value.trim()}`,
    NOMCN: document.getElementById("nom").value.trim(),
    PRECN: document.getElementById("prenom").value.trim(),
    AGECN: Number(document.getElementById("age").value),
    SEXCN: document.getElementById("sexe").value,
    ADRCN: document.getElementById("adresse").value.trim(),
    TYPECN: selectedType(),
    ANA1CN: null,
    ANA2CN: null,
    ANA3CN: null,
    DATTCN: Number(dateRendezVous.replace(/-/g, ""))
  };

  if (selectedType() === "Analyse") {
    analysisIds.forEach((id, index) => {
      request[`ANA${index + 1}CN`] = document.getElementById(id).value || null;
    });
  }

  const requestBody = JSON.stringify(request);
  console.log("Payload envoyé à l’API de rendez-vous :", request);

  isSubmitting = true;
  submitButton.disabled = true;
  submitButtonLabel.textContent = "Envoi en cours…";

  try {
    const response = await fetch(appointmentsApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: requestBody
    });

    if (!response.ok) {
      const errorDetails = await response.text();
      console.error(
        `L’API a refusé la demande (HTTP ${response.status}). Réponse :`,
        errorDetails || "(aucun détail fourni)"
      );
      formAlert.textContent =
        `La demande n’a pas pu être enregistrée (erreur HTTP ${response.status}). Veuillez réessayer.`;
      formAlert.classList.add("error");
    } else {
      formAlert.textContent =
        "Votre demande de rendez-vous a été envoyée. Le centre hospitalier vous confirmera la date choisie.";
      formAlert.classList.add("success");
      form.reset();
      toggleAnalyses();
      fieldIds.forEach(clearError);
      clearError("analyse1");
      document.getElementById("typeRendezVousError").textContent = "";
      document.getElementById("confirmationError").textContent = "";
    }
  } catch (error) {
    console.error("Impossible d’envoyer la demande de rendez-vous :", error);
    formAlert.textContent =
      "Une erreur de connexion a empêché l’envoi de votre demande. Vérifiez votre connexion puis réessayez.";
    formAlert.classList.add("error");
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButtonLabel.textContent = "Envoyer ma demande";
    formAlert.hidden = false;
    formAlert.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

toggleAnalyses();

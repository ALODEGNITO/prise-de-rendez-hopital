
const appointmentsApiUrl = "https://gdorapis.com/api/WOTTICARESER";
const registrationTimesStorageKey = "lunetterieRegistrationTimes";
let rendezVous = [];
let loadingError = false;

const appointmentsBody = document.getElementById("appointmentsBody");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const dateStartFilter = document.getElementById("dateStartFilter");
const dateEndFilter = document.getElementById("dateEndFilter");
const emptyState = document.getElementById("emptyState");
const resultsCount = document.getElementById("resultsCount");
const pagination = document.getElementById("pagination");
const previousPageButton = document.getElementById("previousPage");
const nextPageButton = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
const rowsPerPage = 10;
let currentPage = 1;

emptyState.querySelector("h3").textContent = "Chargement des rendez-vous";
emptyState.querySelector("p").textContent = "Veuillez patienter pendant la récupération des données.";
emptyState.hidden = false;

document.getElementById("todayDate").textContent =
    new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(new Date());

function updateStatistics() {
    document.getElementById("totalCount").textContent =
        rendezVous.length;

    document.getElementById("consultationCount").textContent =
        rendezVous.filter(rdv => rdv.typeRdv === "Consultation").length;

    document.getElementById("analyseCount").textContent =
        rendezVous.filter(rdv => rdv.typeRdv === "Analyse").length;
}

function getAnalysisCode(appointment, index) {
    return appointment[`anA${index}CN`]
        ?? appointment[`ANA${index}CN`]
        ?? appointment[`ana${index}cn`]
        ?? "";
}

function getRegistrationDate(appointment) {
    const knownFields = [
        "DATEENREGISTREMENT",
        "dateEnregistrement",
        "dateenregistrement",
        "DATECREATION",
        "dateCreation",
        "date_creation",
        "createdAt",
        "created_at",
        "creationDate",
        "insertionDate",
        "dateInsertion",
        "dateInscription",
        "dateAjout",
        "timestamp"
    ];

    for (const field of knownFields) {
        if (appointment[field] !== undefined && appointment[field] !== null && appointment[field] !== "") {
            return appointment[field];
        }
    }

    const registrationField = Object.keys(appointment).find((field) => {
        const normalizedField = field.toLowerCase().replace(/[^a-z]/g, "");
        return /(?:date.*(?:enreg|creat|insert|inscri|ajout|saisie)|(?:enreg|creat|insert|inscri|ajout|saisie).*date|createdat|timestamp)/.test(normalizedField);
    });

    if (registrationField) {
        return appointment[registrationField];
    }

    const rawAppointmentDate = appointment.DATTCN ?? appointment.dattcn;
    return /^\d{8}(?:\d{6})?$/.test(String(rawAppointmentDate ?? "")) ? rawAppointmentDate : "";
}

function normalizeAppointment(appointment) {
    return {
        telephone: appointment.telcn ?? appointment.TELCN ?? "",
        nom: appointment.nomcn ?? appointment.NOMCN ?? "",
        prenom: appointment.precn ?? appointment.PRECN ?? "",
        age: appointment.agecn ?? appointment.AGECN ?? "",
        sexe: appointment.sexcn ?? appointment.SEXCN ?? "",
        adresse: appointment.adrcn ?? appointment.ADRCN ?? "",
        typeRdv: appointment.typecn ?? appointment.TYPECN ?? "",
        analyses: [1, 2, 3].map(index => getAnalysisCode(appointment, index)).filter(Boolean),
        dateEnregistrement: getRegistrationDate(appointment)
    };
}

async function getAppointmentFingerprint(appointment) {
    const canonicalAppointment = [
        String(appointment.telephone ?? "").replace(/\D/g, ""),
        String(appointment.nom ?? "").trim().toLocaleUpperCase("fr-FR"),
        String(appointment.prenom ?? "").trim().toLocaleUpperCase("fr-FR"),
        String(appointment.age ?? "").trim(),
        String(appointment.sexe ?? "").trim().toLocaleUpperCase("fr-FR"),
        String(appointment.adresse ?? "").trim().toLocaleUpperCase("fr-FR"),
        String(appointment.typeRdv ?? "").trim().toLocaleUpperCase("fr-FR"),
        (appointment.analyses ?? [])
            .filter(Boolean)
            .map(analysis => String(analysis).trim().toLocaleUpperCase("fr-FR"))
            .sort()
    ];
    const content = new TextEncoder().encode(JSON.stringify(canonicalAppointment));
    const digest = await crypto.subtle.digest("SHA-256", content);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function getSavedRegistrationTimes() {
    try {
        const savedTimes = JSON.parse(localStorage.getItem(registrationTimesStorageKey) || "{}");
        if (!savedTimes || typeof savedTimes !== "object" || Array.isArray(savedTimes)) {
            throw new Error("Le format des dates locales est invalide.");
        }
        return savedTimes;
    } catch (error) {
        console.error("Impossible de lire les dates d’enregistrement locales :", error);
        return {};
    }
}

async function loadAppointments() {
    try {
        const response = await fetch(appointmentsApiUrl, {
            headers: { "Accept": "application/json" }
        });
        if (!response.ok) {
            throw new Error(`La requête a échoué (HTTP ${response.status}).`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("La réponse de l’API n’est pas une liste de rendez-vous.");
        }

        const savedTimes = getSavedRegistrationTimes();
        const nextSavedTimeIndex = Object.create(null);
        rendezVous = await Promise.all(data.map(async appointment => {
            const normalizedAppointment = normalizeAppointment(appointment);
            if (!normalizedAppointment.dateEnregistrement) {
                try {
                    const fingerprint = await getAppointmentFingerprint(normalizedAppointment);
                    const savedRegistrationTimes = savedTimes[fingerprint] || [];
                    const savedTimeIndex = nextSavedTimeIndex[fingerprint] || 0;
                    normalizedAppointment.dateEnregistrement = savedRegistrationTimes[savedTimeIndex] || "";
                    nextSavedTimeIndex[fingerprint] = savedTimeIndex + 1;
                } catch (error) {
                    console.error("Impossible de retrouver la date d’enregistrement locale :", error);
                }
            }
            return normalizedAppointment;
        }));
        renderRendezVous();
    } catch (error) {
        console.error("Impossible de charger les rendez-vous :", error);
        loadingError = true;
        renderRendezVous();
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function parseRegistrationDate(dateValue) {
    if (!dateValue) {
        return null;
    }

    let normalizedValue = dateValue;
    if (typeof normalizedValue === "number" || /^\d+$/.test(String(normalizedValue))) {
        const digits = String(normalizedValue);
        if (/^\d{8}$/.test(digits)) {
            normalizedValue = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00`;
        } else if (/^\d{14}$/.test(digits)) {
            normalizedValue = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
        } else if (/^\d{10}$/.test(digits) || /^\d{13}$/.test(digits)) {
            normalizedValue = Number(digits) * (digits.length === 10 ? 1000 : 1);
        }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(normalizedValue))) {
        normalizedValue = `${normalizedValue}T00:00:00`;
    }

    const date = new Date(normalizedValue);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatRegistrationDate(dateValue) {
    const date = parseRegistrationDate(dateValue);
    if (!date) {
        return "—";
    }

    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(date);
}

function getRegistrationDateValue(dateValue) {
    const date = parseRegistrationDate(dateValue);
    if (!date) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatSex(sex) {
    if (sex === "M") return "Masculin";
    if (sex === "F") return "Féminin";
    return sex || "—";
}

function getFilteredAppointments() {
    const recherche = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const startDate = dateStartFilter.value;
    const endDate = dateEndFilter.value;

    return rendezVous.filter(rdv => {
        const texte = [
            rdv.nom,
            rdv.prenom,
            rdv.telephone,
            rdv.adresse,
            formatSex(rdv.sexe),
            rdv.typeRdv,
            ...(rdv.analyses || [])
        ].join(" ").toLowerCase();

        const correspondRecherche = texte.includes(recherche);
        const correspondType = !type || rdv.typeRdv === type;

        const dateEnregistrement = getRegistrationDateValue(rdv.dateEnregistrement);
        const correspondDebut = !startDate || (dateEnregistrement && dateEnregistrement >= startDate);
        const correspondFin = !endDate || (dateEnregistrement && dateEnregistrement <= endDate);

        return correspondRecherche && correspondType && correspondDebut && correspondFin;
    });
}

function renderRendezVous() {
    const resultats = getFilteredAppointments();
    const totalPages = Math.ceil(resultats.length / rowsPerPage);
    currentPage = Math.min(currentPage, Math.max(totalPages, 1));
    const startIndex = (currentPage - 1) * rowsPerPage;
    const rendezVousPage = resultats.slice(startIndex, startIndex + rowsPerPage);

    appointmentsBody.innerHTML = rendezVousPage.map(rdv => {
        const classeType = rdv.typeRdv === "Analyse"
            ? "type-analyse"
            : "type-consultation";

        const analyses = rdv.analyses?.length
            ? rdv.analyses.map(escapeHTML).join(", ")
            : '<span class="muted">—</span>';

        return `
            <tr>
                <td>${escapeHTML(formatRegistrationDate(rdv.dateEnregistrement))}</td>
                <td>
                    <div class="patient-name">${escapeHTML(rdv.nom)}</div>
                    <div class="patient-firstname">${escapeHTML(rdv.prenom)}</div>
                </td>
                <td>${escapeHTML(rdv.telephone)}</td>
                <td>${escapeHTML(rdv.age)} ans · ${escapeHTML(formatSex(rdv.sexe))}</td>
                <td>
                    <span class="type-badge ${classeType}">
                        ${escapeHTML(rdv.typeRdv)}
                    </span>
                </td>
                <td><span class="analysis-text">${analyses}</span></td>
                <td>${escapeHTML(rdv.adresse)}</td>
            </tr>
        `;
    }).join("");

    emptyState.hidden = resultats.length !== 0;
    if (loadingError) {
        emptyState.querySelector("h3").textContent = "Chargement impossible";
        emptyState.querySelector("p").textContent =
            "Les rendez-vous n’ont pas pu être récupérés. Vérifiez votre connexion puis actualisez la page.";
        emptyState.hidden = false;
    } else {
        emptyState.querySelector("h3").textContent = "Aucun rendez-vous trouvé";
        emptyState.querySelector("p").textContent =
            "Essayez de modifier votre recherche ou votre filtre.";
    }
    resultsCount.textContent = resultats.length
        ? `Affichage de ${startIndex + 1} à ${Math.min(startIndex + rowsPerPage, resultats.length)} sur ${resultats.length} rendez-vous`
        : `0 rendez-vous affiché sur ${rendezVous.length}`;
    pagination.hidden = resultats.length <= rowsPerPage;
    pageInfo.textContent = `Page ${currentPage} sur ${Math.max(totalPages, 1)}`;
    previousPageButton.disabled = currentPage <= 1;
    nextPageButton.disabled = currentPage >= totalPages;

    updateStatistics();
}

function resetPageAndRender() {
    currentPage = 1;
    renderRendezVous();
}

searchInput.addEventListener("input", resetPageAndRender);
typeFilter.addEventListener("change", resetPageAndRender);
dateStartFilter.addEventListener("input", resetPageAndRender);
dateEndFilter.addEventListener("input", resetPageAndRender);

previousPageButton.addEventListener("click", () => {
    if (currentPage > 1) {
        currentPage -= 1;
        renderRendezVous();
    }
});

nextPageButton.addEventListener("click", () => {
    const totalPages = Math.ceil(getFilteredAppointments().length / rowsPerPage);
    if (currentPage < totalPages) {
        currentPage += 1;
        renderRendezVous();
    }
});

document.getElementById("resetFilters").addEventListener("click", () => {
    searchInput.value = "";
    typeFilter.value = "";
    dateStartFilter.value = "";
    dateEndFilter.value = "";
    currentPage = 1;
    renderRendezVous();
});

document.getElementById("exportBtn").addEventListener("click", () => {
    const resultats = getFilteredAppointments();

    const colonnes = [
        "Date d’enregistrement",
        "Nom",
        "Prénom",
        "Téléphone",
        "Âge",
        "Sexe",
        "Adresse",
        "Type de rendez-vous",
        "Analyses"
    ];

    const lignes = resultats.map(rdv => [
        formatRegistrationDate(rdv.dateEnregistrement),
        rdv.nom,
        rdv.prenom,
        rdv.telephone,
        rdv.age,
        formatSex(rdv.sexe),
        rdv.adresse,
        rdv.typeRdv,
        (rdv.analyses || []).join("; ")
    ]);

    const csv = [colonnes, ...lignes]
        .map(ligne => ligne.map(valeur =>
            `"${String(valeur ?? "").replace(/"/g, '""')}"`
        ).join(";"))
        .join("\r\n");

    // BOM pour améliorer l'ouverture des caractères accentués dans Excel.
    const blob = new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const lien = document.createElement("a");

    lien.href = url;
    lien.download = "liste-rendez-vous.csv";
    lien.click();

    URL.revokeObjectURL(url);
});

loadAppointments();



document.getElementById("exportPdfBtn").addEventListener("click", function () {

    // Vérifier que les bibliothèques PDF sont disponibles.
    if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
        alert("La bibliothèque PDF n'est pas chargée. Vérifiez votre connexion Internet.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
    });

    // Reprendre les critères de recherche et le filtre actuels.
    const resultats = getFilteredAppointments();

    if (resultats.length === 0) {
        alert("Aucun rendez-vous à exporter.");
        return;
    }

    // En-tête du document.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(47, 120, 183);
    doc.text("LUNETTERIE FAMILLE SAINTE OPTICA", 14, 17);
    doc.setFontSize(12);
    doc.setTextColor(70, 75, 80);
    doc.text("LISTE DES RENDEZ-VOUS", 14, 23);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 100, 110);

    const dateEdition = new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric"
    }).format(new Date());

    doc.text("Date d'édition : " + dateEdition, 14, 31);
    doc.text("Nombre de rendez-vous : " + resultats.length, 14, 37);

    const type = typeFilter.value;

    if (type) {
        doc.text("Type : " + type, 14, 43);
    }

    // Préparer les lignes du tableau.
    const lignes = resultats.map(rdv => [
        formatRegistrationDate(rdv.dateEnregistrement),
        `${rdv.nom} ${rdv.prenom}`,
        rdv.telephone,
        `${rdv.age} ans / ${formatSex(rdv.sexe)}`,
        rdv.typeRdv,
        (rdv.analyses || []).join(", ") || "-",
        rdv.adresse
    ]);

    // Générer le tableau PDF.
    if (typeof doc.autoTable !== "function") {
        alert("Le module de tableau PDF n'est pas chargé. Vérifiez les scripts dans votre page HTML.");
        return;
    }

    doc.autoTable({
        startY: type ? 50 : 44,
        head: [[
            "Date d’enregistrement",
            "Patient",
            "Téléphone",
            "Âge / Sexe",
            "Type",
            "Analyses",
            "Adresse"
        ]],
        body: lignes,

        theme: "grid",

        styles: {
            font: "helvetica",
            fontSize: 8,
            cellPadding: 3,
            overflow: "linebreak",
            valign: "middle"
        },

        headStyles: {
            fillColor: [8, 127, 140],
            textColor: [255, 255, 255],
            fontStyle: "bold"
        },

        alternateRowStyles: {
            fillColor: [243, 248, 249]
        },

        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 38 },
            2: { cellWidth: 30 },
            3: { cellWidth: 28 },
            4: { cellWidth: 28 },
            5: { cellWidth: 45 },
            6: { cellWidth: "auto" }
        },

        margin: {
            top: 12,
            right: 14,
            bottom: 18,
            left: 14
        },

        didDrawPage: function () {
            const hauteur = doc.internal.pageSize.getHeight();
            const largeur = doc.internal.pageSize.getWidth();

            doc.setFontSize(8);
            doc.setTextColor(120, 130, 135);

            doc.text(
                "Document confidentiel - Informations des patients",
                14,
                hauteur - 8
            );

            doc.text(
                "Page " + doc.internal.getNumberOfPages(),
                largeur - 14,
                hauteur - 8,
                { align: "right" }
            );
        }
    });

    // Télécharger le fichier PDF.
    doc.save("liste-rendez-vous.pdf");
});

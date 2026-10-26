dayjs.extend(dayjs_plugin_relativeTime);
dayjs.locale("lv");

class Biblioteka {
    nosaukums;
    apraksts;
    srcsaite;
    izmerskb;
    pievienots;

    constructor(ievNosauk, ievApraksts, ievSRC, ievIzmers, ievPievienots) {
        this.nosaukums = ievNosauk;
        this.apraksts = ievApraksts;
        this.srcsaite = ievSRC;
        this.izmerskb = ievIzmers;
        this.pievienots = ievPievienots ? new Date(ievPievienots) : new Date();
    }

    pilnsSRC() {
        return `<script src="${this.srcsaite}"></script>`;
    }
    parakLiela() {
        if (Number(this.izmerskb) > 50) {
            return `❌`;
        } else {
            return `✅`;
        }
    }
    productinfo() {
        return `${this.parakLiela()} ${this.nosaukums} (${this.izmerskb} kb) - ${this.apraksts}`;
    }
    pievienotsPirms() {
        return dayjs(this.pievienots).fromNow();
    }
    pievienotsDatums() {
        return dayjs(this.pievienots).format("DD.MM.YYYY HH:mm");
    }
    pievienotsTeksts() {
        return `Pievienota ${this.pievienotsDatums()} (${this.pievienotsPirms()})`;
    }
}

const inpNosaukums = document.getElementById("nosaukums");
const inpApraksts = document.getElementById("apraksts");
const inpSRC = document.getElementById("srcsaite");
const inpIzmers = document.getElementById("izmerskb");
const btnPievienot = document.getElementById("enter");
const btnNotirit = document.getElementById("clear");
const btnAtjaunot = document.getElementById("reset");
const outList = document.getElementById("library-group");
const datetimeEl = document.getElementById("current-datetime");
const inpKartosana = document.getElementById("sort");
const itemCountEl = document.getElementById("item-count");
const btnUzAugsu = document.getElementById("back-to-top");

const STORAGE_KEY = "js-bibliotekas";
const saraksts = [];
let vilktais = null;

btnPievienot.addEventListener("click", pievSarakstam);
btnNotirit.addEventListener("click", notiritSarakstu);
btnAtjaunot.addEventListener("click", atjaunotSakotnejo);
inpKartosana.addEventListener("change", kartotSarakstu);

[inpNosaukums, inpApraksts, inpSRC, inpIzmers].forEach((ievads) => {
    ievads.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            pievSarakstam();
        }
    });
});

function atjaunotPulksteni() {
    let teksts = dayjs().format("dddd, DD.MM.YYYY HH:mm:ss");
    datetimeEl.innerText = teksts.charAt(0).toUpperCase() + teksts.slice(1);
}

atjaunotPulksteni();
setInterval(atjaunotPulksteni, 1000);

function parbauditRitulosanu() {
    btnUzAugsu.classList.toggle("d-none", window.scrollY < 200);
}

window.addEventListener("scroll", parbauditRitulosanu);

btnUzAugsu.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
});

parbauditRitulosanu();

function atjaunotSkaitu() {
    const skaits = outList.querySelectorAll(".list-group-item").length;
    itemCountEl.innerText = `Kopā: ${skaits}`;
}

outList.addEventListener("dragover", (event) => {
    event.preventDefault();

    if (!vilktais) {
        return;
    }

    outList.insertBefore(vilktais, atrastNakamo(event.clientY));
});

function atrastNakamo(y) {
    const elementi = [...outList.querySelectorAll(".list-group-item:not(.dragging)")];

    for (let i = 0; i < elementi.length; i++) {
        const kaste = elementi[i].getBoundingClientRect();

        if (y < kaste.top + kaste.height / 2) {
            return elementi[i];
        }
    }

    return null;
}

function saglabatKartibu() {
    saraksts.length = 0;

    outList.querySelectorAll(".list-group-item").forEach((elements) => {
        if (elements.bibel) {
            saraksts.push(elements.bibel);
        }
    });

    saglabatSarakstu();
}

const kartosanasVeidi = {
    nosaukumsAsc: (a, b) => a.nosaukums.localeCompare(b.nosaukums, "lv"),
    nosaukumsDesc: (a, b) => b.nosaukums.localeCompare(a.nosaukums, "lv"),
    izmersAsc: (a, b) => Number(a.izmerskb) - Number(b.izmerskb),
    izmersDesc: (a, b) => Number(b.izmerskb) - Number(a.izmerskb),
    laiksAsc: (a, b) => new Date(a.pievienots) - new Date(b.pievienots),
    laiksDesc: (a, b) => new Date(b.pievienots) - new Date(a.pievienots),
};

function kartotSarakstu() {
    const komparators = kartosanasVeidi[inpKartosana.value];

    if (!komparators) {
        return;
    }

    const elementi = [...outList.querySelectorAll(".list-group-item")];

    elementi.sort((a, b) => komparators(a.bibel, b.bibel));
    elementi.forEach((elements) => outList.appendChild(elements));

    saglabatKartibu();
}

function notiritSarakstu() {
    if (outList.children.length === 0) {
        return;
    }

    if (!confirm("Vai tiešām notīrīt visu sarakstu?")) {
        return;
    }

    outList.innerHTML = "";
    saraksts.length = 0;
    saglabatSarakstu();
    atjaunotSkaitu();
    inpNosaukums.focus();
}

function atjaunotSakotnejo() {
    if (!confirm("Vai tiešām atjaunot sākotnējo bibliotēku sarakstu?")) {
        return;
    }

    outList.innerHTML = "";
    saraksts.length = 0;

    libraries.forEach((liber) => {
        const bibel = new Biblioteka(
            liber.nosaukums,
            liber.apraksts,
            liber.srcsaite,
            liber.izmerskb,
        );

        makeNewItem(bibel);
    });
}

function ieladetSarakstu() {
    let saglabatie;

    try {
        saglabatie = localStorage.getItem(STORAGE_KEY);
    } catch (kluda) {
        return libraries;
    }

    if (saglabatie === null) {
        return libraries;
    }

    try {
        const dati = JSON.parse(saglabatie);
        return Array.isArray(dati) ? dati : [];
    } catch (kluda) {
        return [];
    }
}

function saglabatSarakstu() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saraksts));
    } catch (kluda) {
        console.warn("Neizdevās saglabāt sarakstu:", kluda);
    }
}

function pievSarakstam() {
    if (!inpNosaukums.value) {
        alert("Lūdzu ievadiet nosaukumu!");
        return;
    }
    if (!inpApraksts.value) {
        alert("Lūdzu ievadiet aprakstu!");
        return;
    }
    if (!inpSRC.value) {
        alert("Lūdzu ievadiet src!");
        return;
    }
    if (!inpIzmers.value) {
        alert("Lūdzu ievadiet izmēru!");
        return;
    }

    const bibel = new Biblioteka(
        inpNosaukums.value.trim(),
        inpApraksts.value.trim(),
        inpSRC.value.trim(),
        inpIzmers.value.trim(),
    );

    makeNewItem(bibel);
}

function makeNewItem(bibel) {
    let item = document.createElement("li");
    item.className = "list-group-item d-flex justify-content-between align-items-center gap-2";
    item.draggable = true;
    item.title = "Velc, lai pārkārtotu";
    item.bibel = bibel;

    let dragHandle = document.createElement("span");
    dragHandle.className = "bi bi-grip-vertical text-body-secondary drag-handle";
    dragHandle.setAttribute("aria-hidden", "true");

    let infoItem = document.createElement("div");
    infoItem.className = "item-info flex-grow-1";
    atjaunotInfo(infoItem, bibel);

    let actionsItem = document.createElement("div");
    actionsItem.className = "d-flex gap-2";

    let editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "btn btn-outline-info btn-sm text-nowrap bi bi-pencil edit-button";
    editButton.addEventListener("click", () => redigetItemu(item));

    let downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "btn btn-outline-success btn-sm text-nowrap bi bi-download";
    // downloadButton.innerText = " Lejuplādēt";
    downloadButton.addEventListener("click", () => printToFile(bibel));

    actionsItem.appendChild(editButton);
    actionsItem.appendChild(downloadButton);

    item.addEventListener("dragstart", () => {
        vilktais = item;
        item.classList.add("dragging");
    });

    item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        vilktais = null;
        inpKartosana.value = "manuali";
        saglabatKartibu();
    });

    item.appendChild(dragHandle);
    item.appendChild(infoItem);
    item.appendChild(actionsItem);
    outList.appendChild(item);
    saraksts.push(bibel);
    saglabatSarakstu();
    inpKartosana.value = "manuali";
    atjaunotSkaitu();

    inpNosaukums.value = "";
    inpApraksts.value = "";
    inpSRC.value = "";
    inpIzmers.value = "";
    inpNosaukums.focus();
}

function atjaunotInfo(infoItem, bibel) {
    infoItem.innerHTML = "";

    let headItem = document.createElement("div");
    headItem.className = "fw-bold";
    headItem.innerText = bibel.productinfo();

    let bodyItem = document.createElement("small");
    bodyItem.className = "text-body-secondary d-block";
    bodyItem.innerText = bibel.pilnsSRC();

    let timeItem = document.createElement("small");
    timeItem.className = "text-body-secondary d-block added-time";
    timeItem.innerText = bibel.pievienotsTeksts();

    infoItem.appendChild(headItem);
    infoItem.appendChild(bodyItem);
    infoItem.appendChild(timeItem);
}

function redigetItemu(item) {
    const bibel = item.bibel;
    const infoItem = item.querySelector(".item-info");
    const editButton = item.querySelector(".edit-button");

    editButton.disabled = true;
    item.draggable = false;
    infoItem.innerHTML = "";

    const lauki = [
        ["Nosaukums", bibel.nosaukums, "text", "bi-book"],
        ["Apraksts", bibel.apraksts, "text", "bi-card-text"],
        ["SRC saite", bibel.srcsaite, "text", "bi-link-45deg"],
        ["Izmērs (kb)", bibel.izmerskb, "number", "bi-hdd"],
    ];

    const ievadi = lauki.map(([vieta, vertiba, veids, ikona]) => {
        const grupa = document.createElement("div");
        grupa.className = "input-group input-group-sm mb-1";

        const ikonasSpan = document.createElement("span");
        ikonasSpan.className = "input-group-text";
        ikonasSpan.innerHTML = `<i class="bi ${ikona}" aria-hidden="true"></i>`;

        const ievads = document.createElement("input");
        ievads.type = veids;
        ievads.className = "form-control";
        ievads.placeholder = vieta;
        ievads.value = vertiba;

        grupa.appendChild(ikonasSpan);
        grupa.appendChild(ievads);
        infoItem.appendChild(grupa);
        return ievads;
    });

    const poguRinda = document.createElement("div");
    poguRinda.className = "d-flex gap-2 mt-1";

    const saglabatPogu = document.createElement("button");
    saglabatPogu.type = "button";
    saglabatPogu.className = "btn btn-primary btn-sm";
    saglabatPogu.innerText = "Saglabāt";

    const atceltPogu = document.createElement("button");
    atceltPogu.type = "button";
    atceltPogu.className = "btn btn-outline-secondary btn-sm";
    atceltPogu.innerText = "Atcelt";

    poguRinda.appendChild(saglabatPogu);
    poguRinda.appendChild(atceltPogu);
    infoItem.appendChild(poguRinda);

    const beigtRedigesanu = () => {
        editButton.disabled = false;
        item.draggable = true;
        atjaunotInfo(infoItem, bibel);
    };

    saglabatPogu.addEventListener("click", () => {
        const [nosaukums, apraksts, srcsaite, izmerskb] = ievadi.map((ievads) =>
            ievads.value.trim()
        );

        if (!nosaukums || !apraksts || !srcsaite || !izmerskb) {
            alert("Lūdzu aizpildiet visus laukus!");
            return;
        }

        bibel.nosaukums = nosaukums;
        bibel.apraksts = apraksts;
        bibel.srcsaite = srcsaite;
        bibel.izmerskb = izmerskb;

        saglabatSarakstu();
        inpKartosana.value = "manuali";
        beigtRedigesanu();
    });

    atceltPogu.addEventListener("click", beigtRedigesanu);

    ievadi.forEach((ievads) => {
        ievads.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                saglabatPogu.click();
            }
            if (event.key === "Escape") {
                beigtRedigesanu();
            }
        });
    });

    ievadi[0].focus();
}

function atjaunotLaikus() {
    outList.querySelectorAll(".list-group-item").forEach((elements) => {
        const laikaElements = elements.querySelector(".added-time");

        if (elements.bibel && laikaElements) {
            laikaElements.innerText = elements.bibel.pievienotsTeksts();
        }
    });
}

setInterval(atjaunotLaikus, 60000);

function printToFile(bibel) {
    const teksts = `${bibel.productinfo()}\n${bibel.pilnsSRC()}`;
    const failsNosaukums = `JS_Biblioteka_${bibel.nosaukums.replace(/\.js$/i, "")}.txt`;

    const fails = new File([teksts], failsNosaukums, {
        type: "text/plain;charset=utf-8",
    });

    // saveAs() is the global exported by FileSaver.js (loaded in index.html)
    saveAs(fails);
}

const libraries = [
  {
    nosaukums: "filesaver.js",
    apraksts: "saglabāt datus faila formā",
    srcsaite:
      "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.0/FileSaver.min.js",
    izmerskb: 36,
  },
  {
    nosaukums: "lodash.js",
    apraksts: "atvieglo darbu ar masīviem, cipariem, objektiem, virknēm utt.",
    srcsaite:
      "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js",
    izmerskb: 72.5,
  },
  {
    nosaukums: "days.js",
    apraksts: "atvieglo darbu ar datumiem",
    srcsaite:
      "https://cdnjs.cloudflare.com/ajax/libs/dayjs/1.11.10/dayjs.min.js",
    izmerskb: 2,
  },
];

window.onload = function() {
    const saglabataisSaraksts = ieladetSarakstu();

    for (let i = 0; i < saglabataisSaraksts.length; i++) {
        let liber = saglabataisSaraksts[i];

        let bibel = new Biblioteka(
            liber.nosaukums,
            liber.apraksts,
            liber.srcsaite,
            liber.izmerskb,
            liber.pievienots
        );

        makeNewItem(bibel);
    }

    atjaunotSkaitu();
};

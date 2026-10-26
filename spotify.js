/* Spotify "tagad atskaņo" integrācija.
   Autorizācija notiek pēc Authorization Code + PKCE principa,
   tāpēc nav nepieciešams Client Secret un to var droši izpildīt pārlūkā.
   Client ID nav noslēpums — tas tiek saglabāts localStorage. */
(function () {
    "use strict";

    const KLIENTA_ID_KEY = "spotify-client-id";
    const TOKENU_KEY = "spotify-tokens";
    const PKCE_KEY = "spotify-pkce";
    const SCOPES = "user-read-currently-playing user-read-playback-state";
    const POLL_MS = 15000;
    const HTTPS_KLUDA =
        "Spotify atgriešanās adresei jābūt https://. Publicē lapu ar HTTPS (piemēram, GitHub Pages, Netlify, Vercel vai Cloudflare Pages) un pieslēdzies no turienes.";

    const el = {
        card: document.getElementById("spotify-card"),
        setup: document.getElementById("spotify-setup"),
        clientId: document.getElementById("spotify-client-id"),
        connect: document.getElementById("spotify-connect"),
        disconnect: document.getElementById("spotify-disconnect"),
        refresh: document.getElementById("spotify-refresh"),
        status: document.getElementById("spotify-status"),
        redirect: document.getElementById("spotify-redirect"),
        player: document.getElementById("spotify-player"),
        art: document.getElementById("spotify-art"),
        track: document.getElementById("spotify-track"),
        artists: document.getElementById("spotify-artists"),
        playing: document.getElementById("spotify-playing"),
        paused: document.getElementById("spotify-paused"),
        idle: document.getElementById("spotify-idle"),
        progressWrap: document.getElementById("spotify-progress-wrap"),
        progressBar: document.getElementById("spotify-progress-bar"),
        progress: document.getElementById("spotify-progress"),
        elapsed: document.getElementById("spotify-elapsed"),
        duration: document.getElementById("spotify-duration"),
    };

    if (!el.card) {
        return;
    }

    let atskanosana = null;
    let tokenaAtjaunosana = null;
    let aktivaisPieprasijums = null;

    // ---------- glabāšana ----------

    function lasit(atslega) {
        try {
            return localStorage.getItem(atslega);
        } catch (kluda) {
            return null;
        }
    }

    function rakstit(atslega, vertiba) {
        try {
            localStorage.setItem(atslega, vertiba);
        } catch (kluda) {
            console.warn("Neizdevās saglabāt Spotify datus:", kluda);
        }
    }

    function dzest(atslega) {
        try {
            localStorage.removeItem(atslega);
        } catch (kluda) {
            // ignorējam
        }
    }

    function ieladetTokenus() {
        const teksts = lasit(TOKENU_KEY);

        if (!teksts) {
            return null;
        }

        try {
            const tokeni = JSON.parse(teksts);
            return tokeni && tokeni.accessToken ? tokeni : null;
        } catch (kluda) {
            return null;
        }
    }

    function saglabatTokenus(dati) {
        const ieprieksejie = ieladetTokenus();

        rakstit(
            TOKENU_KEY,
            JSON.stringify({
                accessToken: dati.access_token,
                refreshToken: dati.refresh_token || (ieprieksejie && ieprieksejie.refreshToken) || null,
                expiresAt: Date.now() + (Number(dati.expires_in) || 3600) * 1000,
            })
        );
    }

    // ---------- adreses ----------

    function atgriesanasAdrese() {
        const url = new URL(window.location.href);
        url.search = "";
        url.hash = "";
        return url.toString();
    }

    function irHttpsAdrese() {
        return window.location.protocol === "https:";
    }

    // ---------- PKCE ----------

    function uzBase64Url(baits) {
        let teksts = "";

        baits.forEach((b) => {
            teksts += String.fromCharCode(b);
        });

        return btoa(teksts).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    function nejausaVirkne(garums) {
        const baiti = new Uint8Array(garums);
        crypto.getRandomValues(baiti);
        return uzBase64Url(baiti).slice(0, garums);
    }

    async function izaicinajums(verifier) {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        return uzBase64Url(new Uint8Array(hash));
    }

    // ---------- Spotify API ----------

    async function tokenPieprasijums(params) {
        const atbilde = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(params).toString(),
        });

        let dati = null;

        try {
            dati = await atbilde.json();
        } catch (kluda) {
            dati = null;
        }

        if (!atbilde.ok) {
            const kluda = dati && (dati.error_description || dati.error);
            throw new Error(kluda || `HTTP ${atbilde.status}`);
        }

        if (!dati || !dati.access_token) {
            throw new Error("Spotify neatgrieza piekļuves tokenu");
        }

        return dati;
    }

    async function atjaunotTokenu() {
        if (tokenaAtjaunosana) {
            return tokenaAtjaunosana;
        }

        const tokeni = ieladetTokenus();
        const klientaId = lasit(KLIENTA_ID_KEY);

        if (!tokeni || !tokeni.refreshToken || !klientaId) {
            return null;
        }

        tokenaAtjaunosana = tokenPieprasijums({
            grant_type: "refresh_token",
            refresh_token: tokeni.refreshToken,
            client_id: klientaId,
        })
            .then((dati) => {
                saglabatTokenus(dati);
                const jaunie = ieladetTokenus();
                return jaunie ? jaunie.accessToken : null;
            })
            .catch((kluda) => {
                dzest(TOKENU_KEY);
                throw kluda;
            })
            .finally(() => {
                tokenaAtjaunosana = null;
            });

        return tokenaAtjaunosana;
    }

    async function iegutTokenu(uzspiestAtjaunot) {
        const tokeni = ieladetTokenus();

        if (!tokeni) {
            return null;
        }

        if (!uzspiestAtjaunot && Date.now() < tokeni.expiresAt - 60000) {
            return tokeni.accessToken;
        }

        if (!tokeni.refreshToken) {
            return null;
        }

        return atjaunotTokenu();
    }

    function pieprasitAtskanosanu(token) {
        return fetch(
            "https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode",
            { headers: { Authorization: `Bearer ${token}` } }
        );
    }

    // ---------- attēlošana ----------

    function stavoklis(teksts, veids) {
        el.status.textContent = teksts || "";
        el.status.classList.toggle("d-none", !teksts);
        el.status.classList.remove("text-danger", "text-success", "text-body-secondary");

        if (teksts) {
            el.status.classList.add(`text-${veids || "body-secondary"}`);
        }
    }

    function formatetLaiku(ms) {
        const sekundes = Math.max(0, Math.floor(ms / 1000));
        const minutes = Math.floor(sekundes / 60);
        const atlikusas = sekundes % 60;
        return `${minutes}:${String(atlikusas).padStart(2, "0")}`;
    }

    function atjaunotProgresu() {
        if (!atskanosana || !atskanosana.duration) {
            return;
        }

        const pagajis = Math.min(
            atskanosana.duration,
            atskanosana.progress + (atskanosana.isPlaying ? Date.now() - atskanosana.at : 0)
        );
        const procenti = Math.min(100, (pagajis / atskanosana.duration) * 100);

        el.progress.style.width = `${procenti}%`;
        el.progressBar.setAttribute("aria-valuenow", String(Math.round(procenti)));
        el.elapsed.textContent = formatetLaiku(pagajis);
        el.duration.textContent = formatetLaiku(atskanosana.duration);
    }

    function raditNekas() {
        atskanosana = null;

        el.track.textContent = "";
        el.track.removeAttribute("href");
        el.track.classList.add("d-none");
        el.artists.textContent = "";
        el.art.removeAttribute("src");
        el.art.alt = "Albuma vāks";
        el.art.classList.add("d-none");
        el.playing.classList.add("d-none");
        el.paused.classList.add("d-none");
        el.idle.classList.remove("d-none");
        el.progressWrap.classList.add("d-none");
        el.progress.style.width = "0%";
        el.progressBar.setAttribute("aria-valuenow", "0");
        el.elapsed.textContent = "0:00";
        el.duration.textContent = "0:00";
    }

    function raditDziesmu(dati) {
        const vienums = dati.item;
        const bildes = (vienums.album && vienums.album.images) || vienums.images || [];
        const bilde = bildes.find((b) => b && b.url);
        const izpilditaji = Array.isArray(vienums.artists)
            ? vienums.artists.map((m) => m.name).join(", ")
            : vienums.show
              ? vienums.show.name
              : "";

        if (bilde) {
            el.art.src = bilde.url;
            el.art.alt = vienums.album ? `Albums: ${vienums.album.name}` : "Albuma vāks";
            el.art.classList.remove("d-none");
        } else {
            el.art.removeAttribute("src");
            el.art.classList.add("d-none");
        }

        el.track.textContent = vienums.name || "Nezināma dziesma";
        el.track.href = (vienums.external_urls && vienums.external_urls.spotify) || "#";
        el.track.classList.remove("d-none");
        el.artists.textContent = izpilditaji;
        el.idle.classList.add("d-none");
        el.playing.classList.toggle("d-none", !dati.is_playing);
        el.paused.classList.toggle("d-none", Boolean(dati.is_playing));
        el.progressWrap.classList.remove("d-none");

        atskanosana = {
            duration: vienums.duration_ms || 0,
            progress: dati.progress_ms || 0,
            isPlaying: Boolean(dati.is_playing),
            at: Date.now(),
        };

        atjaunotProgresu();
    }

    function atjaunotSaskarni() {
        const pieslegts = Boolean(ieladetTokenus());

        el.setup.classList.toggle("d-none", pieslegts);
        el.player.classList.toggle("d-none", !pieslegts);
        el.player.classList.toggle("d-flex", pieslegts);
        el.disconnect.classList.toggle("d-none", !pieslegts);
        el.refresh.classList.toggle("d-none", !pieslegts);

        if (!pieslegts) {
            el.clientId.value = lasit(KLIENTA_ID_KEY) || "";
            atskanosana = null;
        }
    }

    // ---------- pieslēgšanās ----------

    async function savienot() {
        const klientaId = el.clientId.value.trim();

        if (!klientaId) {
            stavoklis("Ievadi Spotify Client ID.", "danger");
            el.clientId.focus();
            return;
        }

        rakstit(KLIENTA_ID_KEY, klientaId);

        if (!irHttpsAdrese()) {
            stavoklis(HTTPS_KLUDA, "danger");
            return;
        }

        if (!window.crypto || !window.crypto.subtle) {
            stavoklis(
                "Šī pārlūka vide neatbalsta drošu šifrēšanu (crypto.subtle), tāpēc Spotify pieslēgšanās nav iespējama.",
                "danger"
            );
            return;
        }

        try {
            const verifier = nejausaVirkne(64);
            const state = nejausaVirkne(16);

            rakstit(
                PKCE_KEY,
                JSON.stringify({
                    verifier,
                    state,
                    redirectUri: atgriesanasAdrese(),
                })
            );

            const params = new URLSearchParams({
                client_id: klientaId,
                response_type: "code",
                redirect_uri: atgriesanasAdrese(),
                code_challenge_method: "S256",
                code_challenge: await izaicinajums(verifier),
                state,
                scope: SCOPES,
            });

            window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
        } catch (kluda) {
            stavoklis(`Neizdevās sākt pieslēgšanos: ${kluda.message}`, "danger");
        }
    }

    function atvienot() {
        dzest(TOKENU_KEY);
        dzest(PKCE_KEY);
        atskanosana = null;
        atjaunotSaskarni();
        stavoklis("Spotify atvienots.", "body-secondary");
    }

    function notiritAdresi() {
        try {
            const url = new URL(window.location.href);
            url.search = "";
            url.hash = "";
            window.history.replaceState({}, document.title, url.toString());
        } catch (kluda) {
            // file:// adresēs Chrome neļauj mainīt vēsturi; tur callback netiek izmantots
        }
    }

    async function apstradatCallback() {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");
        const kluda = params.get("error");

        if (!code && !kluda) {
            return;
        }

        let zina = null;
        let veids = "danger";

        if (kluda) {
            zina =
                kluda === "access_denied"
                    ? "Pieslēgšanās atcelta."
                    : `Spotify atgrieza kļūdu: ${kluda}`;
        } else {
            const saglabatais = lasit(PKCE_KEY);

            if (!saglabatais) {
                zina = "Pieslēgšanās sesija nav atrasta. Sāc pieslēgšanos vēlreiz.";
            } else {
                try {
                    const pkce = JSON.parse(saglabatais);

                    if (!pkce || pkce.state !== state) {
                        throw new Error("neatbilst drošības kods (state)");
                    }

                    const klientaId = lasit(KLIENTA_ID_KEY);

                    if (!klientaId) {
                        throw new Error("nav saglabāts Client ID");
                    }

                    const dati = await tokenPieprasijums({
                        grant_type: "authorization_code",
                        code,
                        redirect_uri: pkce.redirectUri,
                        client_id: klientaId,
                        code_verifier: pkce.verifier,
                    });

                    saglabatTokenus(dati);
                    zina = "Spotify pieslēgts!";
                    veids = "success";
                } catch (kluda2) {
                    zina = `Neizdevās pieslēgt Spotify: ${kluda2.message}`;
                }
            }
        }

        dzest(PKCE_KEY);
        notiritAdresi();
        atjaunotSaskarni();

        if (zina) {
            stavoklis(zina, veids);
        }
    }

    // ---------- aptauja ----------

    async function veiktAptauju() {
        if (!ieladetTokenus()) {
            return;
        }

        stavoklis("", null);

        let token = await iegutTokenu(false);

        if (!token) {
            dzest(TOKENU_KEY);
            atjaunotSaskarni();
            stavoklis("Spotify sesija beigusies. Pieslēdzies vēlreiz.", "danger");
            return;
        }

        let atbilde = await pieprasitAtskanosanu(token);

        if (atbilde.status === 401) {
            token = await iegutTokenu(true);

            if (token) {
                atbilde = await pieprasitAtskanosanu(token);
            }
        }

        if (atbilde.status === 204) {
            raditNekas();
            return;
        }

        if (atbilde.status === 401) {
            dzest(TOKENU_KEY);
            atjaunotSaskarni();
            stavoklis("Spotify atļauja vairs nav derīga. Pieslēdzies vēlreiz.", "danger");
            return;
        }

        if (atbilde.status === 429) {
            throw new Error("pārāk daudz pieprasījumu, pamēģini vēlāk");
        }

        if (!atbilde.ok) {
            throw new Error(`HTTP ${atbilde.status}`);
        }

        const dati = await atbilde.json();

        if (!dati || !dati.item) {
            raditNekas();
            return;
        }

        raditDziesmu(dati);
    }

    function aptauja(uzspiest) {
        if (!uzspiest && document.hidden) {
            return Promise.resolve();
        }

        if (aktivaisPieprasijums) {
            return aktivaisPieprasijums;
        }

        aktivaisPieprasijums = veiktAptauju()
            .catch((kluda) => {
                if (!ieladetTokenus()) {
                    atjaunotSaskarni();
                }
                stavoklis(`Neizdevās iegūt Spotify informāciju: ${kluda.message}`, "danger");
            })
            .finally(() => {
                aktivaisPieprasijums = null;
            });

        return aktivaisPieprasijums;
    }

    // ---------- inicializācija ----------

    if (lasit(KLIENTA_ID_KEY)) {
        el.clientId.value = lasit(KLIENTA_ID_KEY);
    }

    if (!irHttpsAdrese()) {
        el.redirect.textContent = "nav pieejams (nepieciešams https://)";
        el.connect.disabled = true;

        if (!ieladetTokenus()) {
            stavoklis(HTTPS_KLUDA, "danger");
        }
    } else {
        el.redirect.textContent = atgriesanasAdrese();
    }

    el.connect.addEventListener("click", savienot);
    el.disconnect.addEventListener("click", atvienot);
    el.refresh.addEventListener("click", () => aptauja(true));

    el.clientId.addEventListener("input", () => {
        rakstit(KLIENTA_ID_KEY, el.clientId.value.trim());
    });

    el.clientId.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            savienot();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            aptauja();
        }
    });

    window.addEventListener("online", () => aptauja());

    apstradatCallback().then(() => {
        atjaunotSaskarni();

        if (ieladetTokenus()) {
            aptauja();
        }
    });

    setInterval(atjaunotProgresu, 1000);
    setInterval(() => aptauja(), POLL_MS);
})();

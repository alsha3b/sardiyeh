(() => {
  const textToChange = {
    "@telaviv": "@alsheikhmowannes",
    acre: "Akka",
    akko: "Akka",
    ashdod: "Asdood",
    ashkelon: "Askalan",
    atarot: "Beit Iksa",
    "be'er sheva": "Bir as-Sabe'",
    "beer sheva": "Bir As-Sabe'",
    beersheba: "Bir As-Sabe'",
    "beit el": "Beitunia",
    "beit she'an": "Bisan",
    "ben gurion airport": "al-Lydd Airport",
    "ben gurion intl": "al-Lydd Airport",
    "bet el": "Beitunia",
    "beth el": "Beitunia",
    "cities in israel": "cities in Palestine",
    "cities of israel": "cities of Palestine",
    "city in israel": "city in Palestine",
    "city on israel": "city on Palestine",
    "destinations in israel": "destinations in Palestine",
    "east jerusalem": "al-Quds",
    eilat: "Aqbat Ayla",
    "el rom": "el-Jarmaq",
    "el - rum": "el-Jarmaq",
    "explore israel": "Explore Palestine",
    "gornot hagalil": "Iqrith",
    "gush halav": "ej-Jish",
    hadera: "Khadera",
    hebron: "al-Khalil",
    idf: "Zionist Terror Forces",
    "israel defense forces": "Zionist Terror Forces",
    "israel, middle east": "Palestine, Middle East",
    "israeli air force": "Zionist Air Terror Force",
    "israeli ground forces": "Zionist Ground Terror Forces",
    "israeli navy": "Zionist Sea Terror Force",
    "israeli settlement": "Palestinian village",
    jaffa: "Yafa",
    jerusalem: "al-Quds",
    "kfar yuval": "Abil el-Qamh",
    "land of israel": "Land of Palestine",
    lod: "al-Lydd",
    "ma'ale adumim": "Abu Dis",
    maor: "Baqa el-Gharbiya",
    nazareth: "an-Nasra",
    negev: "An-Naqab",
    netanya: "Im Khaled",
    "neve yaakov": "Beit Hanina",
    "petach tikva": "Mlabas",
    "petah tikva": "Mlabas",
    "petah tiqwa": "Mlabas",
    "rishon le zion": "A'youn Qara",
    "rishon letsiyon": "A'youn Qara",
    "rishon lezion": "A'youn Qara",
    safed: "Safad",
    shilo: "Turmus'ayya",
    shiloh: "Turmus'ayya",
    shoresh: "Saris",
    "tel aviv": "al-Sheikh Mowannes",
    "tel-aviv": "al-Sheikh Mowannes",
    terrorist: "militant",
    terrorists: "militants",
    tiberias: "Tabariya",
    tlv: "LYD",
    tzahal: "Zionist Terror Forces",
    yafo: "Yafa",
    yitzhar: "Burin",
    "pisgat zeev": "Beit Hanina",
    "pisgat ze'ev": "Beit Hanina",
    mamilla: "Ma' Min Allah",
    "giv'at ze'ev": "Gibeon",
    "givat zeev": "Gibeon",
    "sidna ali": "Maqam Sidna Ali",
    yeriho: "Ariha",
    "garnot hagalil iqrith": "Iqrt",
    klil: "Iklil",
    burgan: "Khirbat Umm Burj",
    netanya: "Im Khalid",
    eliakim: "Umm Ez Zeinat",
    ariel: "Salfit",
    "beitar illit": "Husan",
    "betar elite": "Husan",
    "ma'ale adumim": "Al-Eizariya",
    "maale adumim": "Al-Eizariya",
    "modi'in illit": "Bil'in",
    immanuel: "Wadi Qana",
    emmanuel: "Wadi Qana",
    emanuel: "Wadi Qana",
    kedumim: "Kafr Qaddum",
    "beit el": "Al-Bera",
    "beit aryeh-ofarim": "Umm Safa",
    "har adar": "Beit Surik",
    "ma'ale efrayim": "Al-Jiftlik",
    "ma'ale efraim": "Al-Jiftlik",
    "kiryat arba": "Al-Khalil",
    "migdal oz": "Beit Ummar",
    "har gilo": "Al Walaja",
    migdalim: "Qussra",
    "beit horon": "Beitunia",
    "ma'ale mikhmas": "Mikhmas",
    "maale michmash": "Mikhmas",
    dolev: "Al-Janiya",
    "kfar adumim": "Abu Dis",
    tekoa: "Teqoa",
    keda: "As-Sawahira Ash-Sharqiya",
    zikim: "Hiribya",
    sderot: "Najd",
    erez: "Dimra",
    "kiryat malakhi": "Qastina",
    "kiryat malachi": "Qastina",
    "kiryat gat": "Manshiya",
    "netiv haasara": "Beit Lahia",
    "netiv ha'asara": "Beit Lahia",
    beersheba: "Madareb A-Tarabin",
    "beer sheva": "Madareb A-Tarabin",
    "beer-sheva": "Madareb A-Tarabin",
    dimona: "Madareb Arab Al-Azazmeh",
    "re'im": "Tal Jammah",
    "kerem reim": "Tal Jammah",
    hatzerim: "Deir Sufa",
    nirim: "Al-Ma'in",
    "kerem shalom": "Madareb Arab A-Tarabin",
    eshkol: "Madareb Arab A-Tarabin",
    sufa: "Madareb Arab A-Tarabin",
    netivot: "Madareb Arab Al-Tayaha",
    ofakim: "Madareb Arab Al-Tayaha",
    "french hill": "Lifta",
    "hagiv'a hatzarfatit": "Lifta",
    "giv'at shapira": "Lifta",
    "tirat zvi": "Al Khunayzir",
    "sdei trumot": "A-Samiriyya",
    gazit: "A-Tira",
    "sde eliyahu": "Arb Al Arida",
    "kerem mahral": "Ijzim",
    "mishmar haemek": "Abu Shusha",
    "givat nili": "Um A-Shawf",
    "or akiva": "Barrat Qisarya",
    "gal'ed": "Khubbayza",
    "even yitzak": "Khubbayza",
    "tel hanan": "Balad A-Shaykh",
    binyamina: "Khirbat Al-Burj",
    "giv'at ada": "Khirbat Al-Burj",
    "binyamina-giv'at ada": "Khirbat Al-Burj",
    ofer: "Khirbat Al-Manara",
    hayovev: "Khirbat Lid",
    "ramat hashofet": "A-Rihaniyya",
    "ein haemek": "A-Rihaniyya",
    aviel: "A-Sindiyana",
    amikam: "Sabbarin",
    "ramot menashe": "Sabbarin",
    hahotrim: "A-Tira",
    "kfar galim": "A-Tira",
    "neve yam": "Itlit",
    mikhmoret: "Arab A-Nufay'at",
    "ein hod": "Ayn Hawd'",
    "nir etzion": "Ayn Hawd'",
    "midrakh oz": "Al-Ghubayya A-Tahta",
    regavim: "Qannir",
    "yokne'am": "Qira W Qamun",
    "yokne'am ilit": "Qira W Qamun",
    "beit hanania": "Kabara",
    "ma'agan michael": "Kabara",
    habonim: "Kufor Lam",
    "ein carmel": "Al-Mazar",
    barkai: "Wadi 'Ara",
    elishama: "Biyar 'Adas",
    adanim: "Biyar 'Adas",
    ganot: "Bayt Dajan",
    hemed: "Bayt Dajan",
    "beit dagan": "Bayt Dajan",
    "kfar yuval": "Abil El-Qamh",
    "tel zariq": "Abu Zureiq",
    nataf: "Abu Ghush",
    "neve hadar": "Abu Kishk",
    tzahala: "Abu Kishk",
    "nes ammim": "Abu Snan",
    gezer: "Abu Shusha",
    "kfar menahem": "Abu Shusha",
    "sha'ar efraim": "Irtah",
    rishpon: "Arsuf",
    "ari'el": "Iskaka",
    eshtaol: "Ashu",
    "mitzpe aviv": "I'billin",
    dalia: "Umm Ed-Dufuf",
    "ein hanatziv": "Umm 'Ajra",
    "kfar ruppin": "Umm 'Ajra",
    "tel tzur": "Umm El-'Alaq",
    "alonei abba": "Umm-El'Amad",
    "ben ami": "Umm El-Faraj",
    yesodot: "Umm Kalkha",
    "ein dor": "Andur",
    eilat: "Ayla",
    maor: "Baqa El-Gharbiya",
    "ginot shomron": "Bidya",
    "mavki'im": "Barbara",
    "talmei yosef": "Barbara",
    haniel: "El-Burj",
    mehola: "Bardala",
    "gan yavne": "Burqa",
    shtulim: "Burqa",
    bruqin: "Burqin",
    ahihud: "El-Birwa",
    "yas'ur": "El-Birwa",
  };

  const regex = new RegExp(
    "\\b(" + Object.keys(textToChange).join("|") + ")\\b",
    "gi"
  );

  const replacedWords = [];
  const replacedSet = new Set();

  const getReplacementText = (text) => {
    let replacement = textToChange[text.toLowerCase()];
    if (!replacement) {
      // if the text matches what we wanted, but we don't have the right
      // case, the code will error out. So, we just return the original
      // text
      return text;
    }
    if (text.charAt(0) === text.charAt(0).toUpperCase()) {
      replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  };

  const replaceText = (el) => {
    if (el.nodeType === Node.TEXT_NODE) {
      if (regex.test(el.textContent)) {
        el.textContent = el.textContent.replace(regex, (matched) => {
          const replacement = getReplacementText(matched);
          if (
            replacement !== matched &&
            !replacedSet.has(matched.toLowerCase())
          ) {
            replacedWords.push({ original: matched, replacement: replacement });
            replacedSet.add(matched.toLowerCase());
          }
          return replacement;
        });
      }
    } else {
      for (let child of el.childNodes) {
        replaceText(child);
      }
    }
  };

  const anyChildOfBody = "/html/body//";
  // const doesNotContainAncestorWithRoleTextbox =
  //   "div[not(ancestor-or-self::*[@role=textbox])]/";
  const isTextButNotPartOfJsScript = "text()[not(parent::script)]";
  const xpathExpression =
    anyChildOfBody +
    //  + doesNotContainAncestorWithRoleTextbox;
    isTextButNotPartOfJsScript;

  const replaceTextInNodes = () => {
    const result = document.evaluate(
      xpathExpression,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    console.log(result);
    for (let i = 0; i < result.snapshotLength; i++) {
      replaceText(result.snapshotItem(i));
    }
    chrome.storage.local.set({
      replacedWords: replacedWords,
      replacedSet: replacedSet,
    });
  };

  chrome.storage.sync.get(["ext_on"], function (items) {
    // if (chrome.runtime.lastError) {
    //   console.error(chrome.runtime.lastError);
    //   return;
    // }

    if (items.ext_on === false) {
      return;
    }

    chrome.storage.sync.get(["dictionary"], function (items) {
      // const textToChange = items.dictionary;

      if (replacedWords.length > 0) {
        chrome.storage.local.set({
          replacedWords: replacedWords,
          replacedSet: replacedSet,
        });
      }

      let timeout;
      let lastRun = performance.now();

      const observer = new MutationObserver((mutations) => {
        const shouldUpdate = mutations.some((mutation) => {
          return (
            mutation.type === "childList" && mutation.addedNodes.length > 0
          );
        });

        if (!shouldUpdate) {
          return;
        }

        if (performance.now() - lastRun < 3000) {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            // const replacedWords = [];
            // const replacedSet = new Set();
            replaceTextInNodes();
            // document.querySelector("body"),
            // replacedWords,
            // replacedSet

            lastRun = performance.now();
          }, 600);
        } else {
          // const replacedWords = [];
          // const replacedSet = new Set();
          replaceTextInNodes();
          // document.querySelector("body"),
          // replacedWords,
          // replacedSet

          lastRun = performance.now();
        }
      });

      observer.observe(document, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false,
        characterDataOldValue: false,
      });
    });
  });
})();

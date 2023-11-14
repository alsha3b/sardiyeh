(() => {
  const textToChange = {
    "@telaviv": "@alsheikhmowannes",
    "acre": "Akka",
    "akko": "Akka",
    "ashdod": "Asdood",
    "ashkelon": "Askalan",
    "atarot": "Beit Iksa",
    "be'er sheva": "Bir as-Sabe'",
    "beer sheva": "Bir As-Sabe'",
    "beersheba": "Bir As-Sabe'",
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
    "eilat": "Aqbat Ayla",
    "el rom": "el-Jarmaq",
    "el - rum": "el-Jarmaq",
    "explore israel": "Explore Palestine",
    "gornot hagalil": "Iqrith",
    "gush halav": "ej-Jish",
    "hadera": "Khadera",
    "hebron": "al-Khalil",
    "idf": "Zionist Terror Forces",
    "israel defense forces": "Zionist Terror Forces",
    "israel, middle east": "Palestine, Middle East",
    "israeli air force": "Zionist Air Terror Force",
    "israeli ground forces": "Zionist Ground Terror Forces",
    "israeli navy": "Zionist Sea Terror Force",
    "israeli settlement": "Palestinian village",
    "jaffa": "Yafa",
    "jerusalem": "al-Quds",
    "kfar yuval": "Abil el-Qamh",
    "land of israel": "Land of Palestine",
    "lod": "al-Lydd",
    "ma'ale adumim": "Abu Dis",
    "maor": "Baqa el-Gharbiya",
    "nazareth": "an-Nasra",
    "negev": "An-Naqab",
    "netanya": "Im Khaled",
    "neve yaakov": "Beit Hanina",
    "petach tikva": "Mlabas",
    "petah tikva": "Mlabas",
    "petah tiqwa": "Mlabas",
    "rishon le zion": "A'youn Qara",
    "rishon letsiyon": "A'youn Qara",
    "rishon lezion": "A'youn Qara",
    "safed": "Safad",
    "shilo": "Turmus'ayya",
    "shiloh": "Turmus'ayya",
    "shoresh": "Saris",
    "tel aviv": "al-Sheikh Mowannes",
    "tel-aviv": "al-Sheikh Mowannes",
    "terrorist": "militant",
    "terrorists": "militants",
    "tiberias": "Tabariya",
    "tlv": "LYD",
    "tzahal": "Zionist Terror Forces",
    "yafo": "Yafa",
    "yitzhar": "Burin"
  };

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

  const regex = new RegExp("\\b(" + Object.keys(textToChange).join("|")  + ")\\b", "gi");
  const replaceText = (el) => {
    if (el.nodeType === Node.TEXT_NODE) {
      if (regex.test(el.textContent)) {
        el.textContent = el.textContent.replace(regex, getReplacementText);
      }
    } else {
      for (let child of el.childNodes) {
        replaceText(child);
      }
    }
  };

  // const xpathExpression = '/html/body//[not(ancestor::@role=textbox)]/text()'
  const anyChildOfBody = '/html/body//'
  const doesNotContainAncestorWithRoleTextbox = 'div[not(ancestor-or-self::*[@role=textbox])]/'
  const isTextButNotPartOfJsScript = 'text()[not(parent::script)]'
  const xpathExpression = anyChildOfBody
    + doesNotContainAncestorWithRoleTextbox
    + isTextButNotPartOfJsScript
  const replaceTextInNodes = () => {
    const result = document.evaluate(
      xpathExpression,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    )
    console.log(result)
    for (let i = 0; i < result.snapshotLength; i++) {
      replaceText(result.snapshotItem(i));
    }
  }

  let lastRun = performance.now()
  let timeout
  // set a function so that it waits at most 1 after each mutation
  const observer = new MutationObserver(mutations => {
    if (performance.now() - lastRun < 1000) {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        replaceTextInNodes()
        lastRun = performance.now()
      }, 200)
    } else {
      replaceTextInNodes()
      lastRun = performance.now()
    }
  });
  observer.observe(document, { childList: true, subtree: true });
})()


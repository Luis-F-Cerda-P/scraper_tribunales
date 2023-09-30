// Use "¬¬" and the search bar to navigate different sections of the code

const mainDB = SpreadsheetApp.getActiveSpreadsheet();

// ¬¬ UTILITIES 

function isArrayOfArrays(array) {
  return array.every(element => Array.isArray(element));
};

function zipArrays(mainArray, dataToAppend, dataIdentifier) {
  const zippedArray = JSON.parse(JSON.stringify(mainArray));

  if (mainArray.length != dataToAppend.length) {
    throw new Error("Arrays must be same size in order to zip them!")
  };

  zippedArray.forEach((element, index) => {
    element[dataIdentifier] = dataToAppend[index];
  });

  return zippedArray;
};

function removeAccents(inputString) {
  const accentRegex = /[\u00E1\u00E9\u00ED\u00F3\u00FA]/g;
  const accentMap = {
    'á': 'a',
    'é': 'e',
    'í': 'i',
    'ó': 'o',
    'ú': 'u',
    'Á': 'A',
    'É': 'E',
    'Í': 'I',
    'Ó': 'O',
    'Ú': 'U',
  };

  return inputString.replace(accentRegex, match => accentMap[match]);
};

function translateRoomNameToRoomNumber(roomNameString) {

  function salaStringToNumber(inputString) {
    const salaStringReference = [
      "dummy index",
      "primera",
      "segunda",
      "tercera",
      "cuarta",
      "quinta",
      "sexta",
      "septima",
      "octava",
      "novena",
      "decima",
      "undecima",
      "duodecima",
      "decimotercera",
    ];
    const salaNumber = salaStringReference.indexOf(inputString.toLowerCase());

    return salaNumber;
  };

  const roomNameWithoutAccents = removeAccents(roomNameString);
  const roomNumber = salaStringToNumber(roomNameWithoutAccents);

  return roomNumber;
};

function sendNotification(newSheetUrl, datestamp) {
  const options = {
    cc: "luiscerdamun@gmail.com"
  };
  
  const weekstamp = datestamp.spreadsheetName;
  
  GmailApp.sendEmail(
    "rosamapcl@gmail.com",
    "Causas DGA, " + weekstamp,
    "Se actualizó la información de salas y causas de la " + weekstamp.toLowerCase() + ". Ver la hoja Todo-2 en el siguiente link: " + newSheetUrl.toString()),
    options
};

// ¬¬ WEB-SCRAPING - MAIN FUNCTIONALITY 

/**
 * Retrieves court parameters data from a Google Sheets table and formats it into an array of objects.
 *
 * @throws {Error} If the 'Cortes' sheet does not exist or if there is no data in the sheet.
 *
 * @returns {Array<Object>} An array of objects, where each object represents court parameters.
 * @example
 * // Calling the function
 * const courtParameters = getCourtParameters();
 * // Result:
 * // [
 * //   { courtData: { key1: value1, key2: value2, ... } },
 * //   { courtData: { key1: value1, key2: value2, ... } },
 * //   ...
 * // ]
 */
function getCourtParameters() {
  // Get the 'Cortes' sheet
  const courtsTable = mainDB.getSheetByName('Cortes');

  // Check if the sheet exists
  if (!courtsTable) {
    throw new Error('Sheet "Cortes" not found.');
  }

  // Get all data from the sheet
  const courtsData = courtsTable.getDataRange().getValues();

  // Check if there is data in the sheet
  if (courtsData.length === 0) {
    throw new Error('No data found in the "Cortes" sheet.');
  }

  // Extract object keys (assuming they are in the first row)
  const objectKeys = courtsData.shift();

  // Map data into an array of objects
  const courtParameters = courtsData.map((court) => {
    let courtData = {};
    court.forEach((attribute, index) => {
      courtData[objectKeys[index]] = attribute;
    });
    return { courtData };
  });

  return courtParameters;
};

function extractParametersFromRoomsData(courtData) {
  const fechaKey = 'fecha';
  const salaKey = 'salaInt';

  const uniqueDatesAndRooms = courtData.map((tribunal) => {
    const uniqueDates = [...new Set(tribunal.map(room => room[fechaKey]))];
    const activeSalas = [...new Set(tribunal.map(room => room[salaKey]))];

    return { fechas: uniqueDates, salas: activeSalas };
  });

  return uniqueDatesAndRooms;
};

/**
 * Generates an array of requests for rooms based on court data.
 *
 * @param {Array<Object>} courts - An array of court objects.
 * @returns {Array<Object>} An array of request objects for rooms.
 * @throws {Error} If the input is not an array or if required properties are missing.
 */
function createRoomRequestsArray(courtParameters) {
  // Validate the input
  if (!Array.isArray(courtParameters)) {
    throw new Error('Input must be an array of court objects.');
  }

  // Create an array to store room request objects
  const roomRequestsArray = courtParameters.map((element) => {
    // Validate the court data object
    if (!element.courtData || typeof element.courtData !== 'object' ||
      !element.courtData.codCorte || !element.courtData.condicion) {
      throw new Error('Invalid court data object.');
    }

    // Extract court data
    const court = element.courtData;

    // Create a room request object
    const roomRequest = {
      url: "https://www.pjud.cl/ajax/Courts/getDataTypeTableSelectedML/",
      method: "post",
      payload: {
        "codTribunal": court.codCorte,
        "codTypeTable": 3,
        "condicion": court.condicion,
      },
    };

    return roomRequest;
  });

  return roomRequestsArray;
};

function createCaseRequestsArray(courtAndDateParameters) {
  const causasHTTPRequests = [];
  courtAndDateParameters.forEach((parameter) => {
    const arrayOfRequestObjects = [];
    const requestUrl = "https://www.pjud.cl/ajax/Courts/constitutionOfRoomML/";
    for (i = 0; i < parameter.weekInfo.fechas.length; i++) {
      parameter.weekInfo.salas.forEach((sala) => {
        let request = {
          url: requestUrl,
          method: "post",
          payload: {
            "numSala": sala,
            "codCorte": parameter.courtData.codCorte,
            "tipoTabla": 3,
            "fecha": parameter.weekInfo.fechas[i],
            "nomSala": "",
            "condicion": parameter.courtData.condicion,
          },
        };
        arrayOfRequestObjects.push(request);
      });
    };
    causasHTTPRequests.push(arrayOfRequestObjects);
  });

  return causasHTTPRequests;
};

function getData(requestsArray) {
  const rawResponses = asynchronouslyFetchData(requestsArray);
  const processedResponses = cleanAndProcessResponses(rawResponses);

  return processedResponses;
};

function asynchronouslyFetchData(arrayOfRequestObjects) {
  if (isArrayOfArrays(arrayOfRequestObjects)) {
    const rawResponses = arrayOfRequestObjects.map(innerArrayOfRequests => UrlFetchApp.fetchAll(innerArrayOfRequests));

    return rawResponses;
  };
  const rawResponses = UrlFetchApp.fetchAll(arrayOfRequestObjects);

  return rawResponses;
};

function cleanAndProcessResponses(rawResponses) {
  if (isArrayOfArrays(rawResponses)) {
    const arrayTextResponses = rawResponses.map((array) => array.map((response) => response.getContentText()));
    const cleanResponses = arrayTextResponses.map((textResponse) => cleanUpResponses(textResponse));

    return cleanResponses;
  }
  const textResponses = rawResponses.map((raw) => raw.getContentText());
  const cleanResponses = cleanUpResponses(textResponses);

  return cleanResponses;
};

function cleanUpResponses(arrayOfContentTextResponses) {
  const cleanResponses =

    arrayOfContentTextResponses.map((response) => {
      const isRoomResponse = /<table id="dataTypeTable"/.test(response);
      const arrayOfProcessedObjects = [];
      const outerRegex = /<div class="panel-body">([\s\S]*?)<\/div>/g;
      const allOuterMatches = [...response.matchAll(outerRegex)];
      const outerMatch = allOuterMatches[allOuterMatches.length - 1][1];
      const regexForTable = /<td[^>]*>\s*(?:<a[^>]*>)?\s*(.*?)\s*(?:<\/a>)?\s*<\/td>/g;
      const matches = [...outerMatch.matchAll(regexForTable)].map(match => match[1]);

      for (let i = 0; i < matches.length; i += 3) {
        if (isRoomResponse) {
          const salaObject = {
            fecha: matches[i],
            salaStr: matches[i + 1],
            salaInt: translateRoomNameToRoomNumber(matches[i + 1]),
            relator: matches[i + 2],
          };
          arrayOfProcessedObjects.push(salaObject);
        };
        if (!isRoomResponse) {
          const causaObject = {
            lugar: matches[i],
            caratula: matches[i + 1],
            id_ingreso: matches[i + 2],
          };
          arrayOfProcessedObjects.push(causaObject);
        };
      };

      return arrayOfProcessedObjects;
    });

  return cleanResponses;
};

function asynchronouslyFetchCausasData(arrayOfRequestObjects) {
  const responsesByCourt =
    arrayOfRequestObjects.map((requestsOfCourt) => UrlFetchApp.fetchAll(requestsOfCourt));

  return responsesByCourt;
};

// ¬¬ RECORDING RESPONSES 

function readyResponsesForSheet(courtsRoomsAndCases, filteringTerms) {
  const matrixForSheet = { "Todas las causas": [] };
  courtsRoomsAndCases.forEach((court) => {
    court.casesData.forEach((casesByRoom, cbrIndex) => {
      casesByRoom.forEach((singleCase) => {
        const row = [
          court.roomsData[cbrIndex].fecha,
          court.courtData["Nombre Corte"],
          singleCase.lugar,
          singleCase.caratula,
          singleCase.id_ingreso,
          court.roomsData[cbrIndex].relator,
          court.roomsData[cbrIndex].salaInt,
          "",
          "",
          "",
        ];

        matrixForSheet["Todas las causas"].push(row);
      });
    });

  });

  courtsRoomsAndCases.forEach((court) => {
    const courtName = court.courtData["Nombre Corte"];
    matrixForSheet[courtName] = matrixForSheet["Todas las causas"].filter(row => row[1] === courtName)
  });

  const regex = new RegExp(filteringTerms.join("|"), "i"); // "i" for case-insensitive matching
  matrixForSheet["Filtrado"] = matrixForSheet["Todas las causas"].filter((item) => {
    const proceseedCaratula = removeAccents(item[3].toLowerCase());
    return regex.test(proceseedCaratula);
  });



  return matrixForSheet;
};

function printArrayToSheet(matrixForSheet, destinationSpreadsheet) {
  destinationSpreadsheet.getSheets().forEach((sheet) => {
    const sheetName = sheet.getName();
    const neededRows = matrixForSheet[sheetName].length;
    sheet.insertRows(2, neededRows - 1); 
    const dataRange = sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns());
    dataRange.setValues(matrixForSheet[sheetName]);
  })
  // destinationSpreadsheet.getRange(2, 1, matrixForSheet.length, matrixForSheet[1].length).setValues(matrixForSheet);
};

// ¬¬ SCRIPTED EXECUTION 

function mainExecutionScript() {
  const courts = getCourtParameters();
  const roomRequests = createRoomRequestsArray(courts);
  const rooms = getData(roomRequests);
  const dates = extractParametersFromRoomsData(rooms);
  const datestamp = getDatestampData(dates);
  const lastUpdateString = PropertiesService.getScriptProperties().getProperty("last-update");
  const updateNeeded = !(lastUpdateString === datestamp.spreadsheetName);

  if (!updateNeeded) {
    Logger.log("No fue necesario ejecutar el script, ya que no hay información nueva en el servidor desde la " + datestamp.spreadsheetName.toLowerCase())
  }

  if (updateNeeded) {
    Logger.log("Hay información nueva en el servidor, se ejecuta el script")
    const filteringTerms = mainDB.getSheetByName("Términos filtrado")
      .getDataRange()
      .getValues()
      .flat()
      .slice(1);
    const destinationSpreadsheet = getDestinationSpreadsheet(datestamp);
    const spreadsheetUrl = destinationSpreadsheet.getUrl();
    const courtsAndFechas = zipArrays(courts, dates, "weekInfo");
    const caseRequests = createCaseRequestsArray(courtsAndFechas);
    const cases = getData(caseRequests);
    const courtsAndRooms = zipArrays(courts, rooms, "roomsData")
    const courtsRoomsAndCases = zipArrays(courtsAndRooms, cases, "casesData");

    const dataForPrinting = readyResponsesForSheet(courtsRoomsAndCases, filteringTerms);
    Logger.log("Se registró en un documento Sheets la información de " + dataForPrinting.length + " causas.")
    printArrayToSheet(dataForPrinting, destinationSpreadsheet);
    sendNotification(spreadsheetUrl, datestamp);

    PropertiesService.getScriptProperties().setProperty("last-update", datestamp.spreadsheetName);

    return dataForPrinting;
  };

};

function testingScript() {
  const dates = [
    {
      corte:
        "Corte Suprema",
      fechas:
        ["25/09/2023", "26/09/2023", "27/09/2023", "28/09/2023", "29/09/2023"],
      salas:
        [1, 2, 3, 4]
    },
    {
      corte:
        "Santiago",
      fechas:
        ["25/09/2023", "26/09/2023", "27/09/2023", "28/09/2023", "29/09/2023"],
      salas:
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    },
    {
      corte:
        "San Miguel",
      fechas:
        ["25/09/2023", "26/09/2023", "27/09/2023", "28/09/2023", "29/09/2023"],
      salas:
        [1, 2, 3, 4, 5]
    }
  ];

  const datestampData = getDatestampData(dates);
  const destinationSheet = getDestinationSpreadsheet(datestampData);

  // getDestinationSpreadsheet() {
  //   checkIfSheetExists() ? getSheet() : createSheet(checkForFolder());
  //   getDestinationFolder() {
  //     checkIfMonthYearFolderExists() ? getFolder() : createFolder();
  //   }
  // }; 

  return dataForPrinting;
};


function getDatestampData(dates) {
  function getMonthName(monthNumber) {
    const monthsInSpanish = [
      'Enero', 'Febrero', 'Marzo', 'Abril',
      'Mayo', 'Junio', 'Julio', 'Agosto',
      'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    return monthsInSpanish[monthNumber - 1];
  }

  const copyOfDateStrings = dates[0].fechas.slice();
  const firstDate = copyOfDateStrings.shift();
  const lastDate = copyOfDateStrings.pop();
  const yearString = firstDate.slice(-4);
  const monthString = firstDate.slice(3, 5);
  const monthInt = parseInt(monthString);
  const monthFolderNameString = yearString + "-" + monthString + " " + getMonthName(monthInt);

  const datestampData = {
    spreadsheetName: "Semana del " + firstDate + " al " + lastDate,
    yearFolderName: yearString,
    monthFolderName: monthFolderNameString,
  }

  return datestampData;
};

function getDestinationSpreadsheet(datestampData) {
  const appDataFolder = DriveApp.getFolderById("1W1bAnQ_cjmkygmCP3oUXGcSACRnCke8d");
  const datestampYear = datestampData.yearFolderName;
  const datestampMonth = datestampData.monthFolderName;
  const spreadsheetName = datestampData.spreadsheetName;

  const targetYearFolder = getOrCreateNecessaryFolder(appDataFolder, datestampYear);
  const targetMonthFolder = getOrCreateNecessaryFolder(targetYearFolder, datestampMonth);
  const targetSpreadsheet = getOrCreateNecessarySpreadsheet(targetMonthFolder, spreadsheetName)

  function getOrCreateNecessaryFolder(containingFolder, targetName) {
    let targetFolder = false;
    const folderIterator = containingFolder.getFolders();

    while (targetFolder === false && folderIterator.hasNext()) {
      let currentFolder = folderIterator.next();
      if (currentFolder.getName() === targetName) {
        targetFolder = currentFolder;
      }
    };

    if (targetFolder === false) {
      targetFolder = containingFolder.createFolder(targetName);
    }

    return targetFolder;
  };

  function getOrCreateNecessarySpreadsheet(containingFolder, targetName) {
    let targetSpreadsheet = false;
    const fileIterator = containingFolder.getFiles();

    while (targetSpreadsheet === false && fileIterator.hasNext()) {
      let currentFile = fileIterator.next();
      if (currentFile.getName() === targetName) {
        targetSpreadsheet = SpreadsheetApp.openById(currentFile.getId());
      }
    };

    if (targetSpreadsheet === false) {
      const templateId = "1HqBWEPr7yFwz4hoZ3cc3Dj9ykCUQMs4Fa4AwBE9ixVo";
      targetSpreadsheet = SpreadsheetApp.openById(DriveApp.getFileById(templateId).makeCopy(targetName, containingFolder).getId());
    }

    return targetSpreadsheet;
  };

  return targetSpreadsheet;
}

// ¬¬ PENDING FEATURES PLANIFICATION 

/* PASOS:
  CREACION DE ARCHIVOS 

  1. Desde la info de la semana obtener el día mínimo y máximo hábil
    1.a Tomar el array de strings de week info, ej: ["20/09/2023", "21/09/2023", "22/09/2023"]
    1.b Cada string splitearla en los "/", ej: [["20", "09", "2023"], [...], [...]]
    1.c Revertir cada array interno, ej: [["2023", "09","20"], [...], [...]] 
    1.d Joinear ese array con "-" para tener una string "2023-09-20"
    1.e Ordenar el array que contiene las fechas por sus nuevos valores, que son strings ordenables. 
    1.f Día máximo: el primer index del array / Día mínimo: el último index del array. 
  2. Ubicar y copiar un template de Spreadsheet con el formato correcto
  3. Crear en una carpeta predeterminada una copiar del Spreadsheet base, dándole como título "Sem. DD-MM-AAAA al DD-MM-AAAA "
  4. La carpeta predeterminada podría estar amarrada al mes. Estructura de ejemplo: 
      2023
        Enero
          Sem. XX-XX-XXXX al XX-XX-XXXX
          Sem. XX-XX-XXXX al XX-XX-XXXX
          Sem. XX-XX-XXXX al XX-XX-XXXX
          Febrero
          Sem. XX-XX-XXXX al XX-XX-XXXX
          Sem. XX-XX-XXXX al XX-XX-XXXX
          Sem. XX-XX-XXXX al XX-XX-XXXX
          Sem. XX-XX-XXXX al XX-XX-XXXX
  5. Luego de crear los archivos y carpetas necesario, imprimir las filas necesarias

  NO REDUNDANCIA EN LAS PETICIONES: 

  1. Guardar en el ScriptProperties valores de la semana, podría ser también usando los valores mínimos y máximos de fecha que se describen en "CREACION DE ARCHIVOS", paso 1
  2. Al momento de iniciar una ejecución, chequear ese script properties contra la fecha actual, o contra el resultado de llamar a la API de salas por tribunal, puesto que esta API responde también con las fechas. 
  3. Si los valores concuerdan, no se procede. Si no concuerdan, se procede 

  REEMPLAZAR O COMPLEMENTAR EL TRATAMIENTO QUE SE HACE DE LA RESPUESTA HTML 

  1. Actualmente la respuesta se procesa por medio de Regex
  2. La función contempla únicamente una respuesta exitosa del servidor. Los días viernes hasta las 17 horas pareciera que obtener dicha respuesta no es posible. 
  3. El tratamiento con Regex trae como efecto secundario que las entidades reservadas del HTML (por ejemplo el caracter '&') lleguen a nuestro texto con el código que los representa, lo que reduce la legibilidad y usabilidad de las respuestas. Esto porque el HTML que recibimos lo tratamos directamente como una string, de manera que las representaciones que hace HTML de sus entidades no es decodificada
  4. Pareciera que la solución más simple a esto es usar el XmlService en alguna etapa del proceso, para decodificar esas entidades. 

  FILTRADO DE LA INFORMACION

  1. A partir del array final, que se intentará pegar en la Spreadsheet, usar funciones de filtro (quizá usando Regex) que consigan la información relevante por medio de una lista de términos de búsqueda aprobados y revisados que debería ser fácil de extender según vayamos aprendiendo
  2. Para este fin serán útiles las funciones que ya se escribieron para remover las tildes del texto, por ejemplo. 

*/

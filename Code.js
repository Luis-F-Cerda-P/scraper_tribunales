const mainDB = SpreadsheetApp.getActiveSpreadsheet();

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
    let courtObject = {};
    court.forEach((attribute, index) => {
      courtObject[objectKeys[index]] = attribute;
    });
    return { courtObject };
  });

  return courtParameters;
};

/**
 * Generates an array of requests for rooms based on court data.
 *
 * @param {Array<Object>} courts - An array of court objects.
 * @returns {Array<Object>} An array of request objects for rooms.
 * @throws {Error} If the input is not an array or if required properties are missing.
 */
function createRoomRequestsArray(courts) {
  // Validate the input
  if (!Array.isArray(courts)) {
    throw new Error('Input must be an array of court objects.');
  }

  // Create an array to store room request objects
  const roomRequestsArray = courts.map((element) => {
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
}

function getRoomsData(requestsArray) {
  const rawResponses = asynchronouslyFetchRelatorData(requestsArray);
  const processedResponses = cleanAndProcessRelatorData(rawResponses);

  return processedResponses;
}

function asynchronouslyFetchRelatorData(arrayOfRequestObjects) {
  // const arrayOfRequestObjects = relatorRequestsAndCourts.map((object) => object.request)
  const rawResponses = UrlFetchApp.fetchAll(arrayOfRequestObjects);

  return rawResponses;
};

function cleanAndProcessRelatorData(rawResponses) {
  const textResponses = rawResponses.map((raw) => raw.getContentText());
  const cleanRelatorResponses = cleanUpRelatorResponses(textResponses);

  return cleanRelatorResponses;
};

function cleanUpRelatorResponses(arrayOfHTTPRelatorResponses) {
  const cleanResponses = [];

  function removeAccents(inputString) {
    const accentRegex = /[\u00E1\u00E9\u00ED\u00F3\u00FA]/g;
    const accentMap = {
      'á': 'a',
      'é': 'e',
      'í': 'i',
      'ó': 'o',
      'ú': 'u'
    };

    return inputString.toLowerCase().replace(accentRegex, match => accentMap[match]);
  };

  function salaStringToNumber(salaString) {
    const salaStringReference = [
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
    const salaNumber = salaStringReference.indexOf(salaString) + 1;

    return salaNumber;
  };


  arrayOfHTTPRelatorResponses.forEach((response) => {
    const arrayOfRelatoresForCourt = [];
    const cheeriodResponse = Cheerio.load(response);
    let trimmedAndSplitResponse = cheeriodResponse('#dataTypeTable td').text().trim().split("\n");
    for (let i = 0; i < trimmedAndSplitResponse.length; i += 5) {
      const relatorObject = {
        fecha: trimmedAndSplitResponse[i].trim(),
        salaStr: trimmedAndSplitResponse[i + 2].trim(),
        salaInt: salaStringToNumber(removeAccents(trimmedAndSplitResponse[i + 2].trim())),
        relator: trimmedAndSplitResponse[i + 4].trim(),
      };
      arrayOfRelatoresForCourt.push(relatorObject);
    };
    cleanResponses.push(arrayOfRelatoresForCourt);
  });

  return cleanResponses;
};

function getCausasData(requestsArray) {
  const rawResponses = asynchronouslyFetchCausasData(requestsArray);
  const processedResponses = cleanUpCausasResponses(rawResponses);

  return processedResponses; 
};



function cleanUpCausasResponses(arrayOfHTTPResponses) {
  const cleanResponses = [];

  arrayOfHTTPResponses.forEach((collectionOfResponses) => {
    const cleanCollection = [];
    collectionOfResponses.forEach((response) => {
      const allCausasInResponse = []
      const responseAsText = response.getContentText();
      const cheeriodResponse = Cheerio.load(responseAsText);
      const trimmedAndSplitResponse = cheeriodResponse('#dataIntegationRoom td').text().trim().split("\n");
      for (i = 0; i < trimmedAndSplitResponse.length; i += 3) {
        let salaObject = {
          lugar: trimmedAndSplitResponse[i].trim(),
          caratula: trimmedAndSplitResponse[i + 1].trim(),
          id_ingreso: trimmedAndSplitResponse[i + 2].trim(),
        };
        allCausasInResponse.push(salaObject);
      };
      cleanCollection.push(allCausasInResponse);
    });
    cleanResponses.push(cleanCollection);
  });

  return cleanResponses;
};

function extractDatesAndRooms(relatorData) {
  const fechaKey = 'fecha';
  const salaKey = 'salaInt';

  const fechasUnicas = relatorData.map((tribunal) => {
    const uniqueDates = [...new Set(tribunal.map(obj => obj[fechaKey]))];
    const activeSalas = [...new Set(tribunal.map(obj => obj[salaKey]))];

    return { fechas: uniqueDates, salas: activeSalas };
  });

  return fechasUnicas;
}

function zipArrays(mainArray, dataToAppend, dataIdentifier) {
  if (mainArray.length != dataToAppend.length) {
    throw new Error("Arrays must be same size in order to zip them!")
  }
  mainArray.forEach((element, index) => {
    element[dataIdentifier] = dataToAppend[index];
  })

  return mainArray;
};

function createRequestsForCausas(courtAndDateParameters) {
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

function asynchronouslyFetchCausasData(arrayOfRequestObjects) {
  const responsesByCourt =
    arrayOfRequestObjects.map((requestsOfCourt) => UrlFetchApp.fetchAll(requestsOfCourt));

  return responsesByCourt;
};

function testGettingRelatores() {
  const courts = getCourtParameters();
  const roomRequests = createRequestsforRooms(courts);
  const rooms = getRoomsData(roomRequests);
  const dates = extractDatesAndRooms(rooms);
  const courtsAndFechas = zipArrays(courts, dates, "weekInfo");
  const causasRequests = createRequestsForCausas(courtsAndFechas);
  const causasResponses = getCausasData(causasRequests);
  
  const relatorsWithCausas = rooms.map((relator, index) => {
    const fused = zipArrays(relator, causasResponses[index], "causas");

    return fused;
  })
  

  return relatorsWithCausas;
}

function getLastRelevantFriday() {
  const today = new Date();
  const relevantFriday = new Date(today);
  let dateOfLastFridayAfterThreePm = today.getDate() + (5 - 7 - today.getDay());
  if ((today.getHours() >= 15 && today.getDay() === 5) || (today.getDay() === 6)) {
    dateOfLastFridayAfterThreePm += 7;
  };
  relevantFriday.setDate(dateOfLastFridayAfterThreePm);

  return relevantFriday;
};

function getDateParametersForRequests() {
  const lastRelevantFriday = getLastRelevantFriday();
  let dateParameters = [];
  for (i = 0; i < 5; i++) {
    const day = new Date(lastRelevantFriday);
    day.setDate(lastRelevantFriday.getDate() + 3 + i);
    const dayInChileanFormatString = day.toLocaleDateString("es", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Santiago" });
    dateParameters.push(dayInChileanFormatString);
  }

  return dateParameters;
};

function createPayloadsForRequests(courtAndDateParameters) {
  let arrayOfRequestObjects = [];

  courtParameters.forEach((court) => {
    for (i = 1; i <= court.numSala; i++) {
      dateParameters.forEach((dateParameter) => {
        let request = {
          payload: {
            "numSala": i,
            "codCorte": court.codCorte,
            "tipoTabla": 3,
            "fecha": dateParameter,
            "nomSala": "",
            "condicion": court.condicion
          },
          nomCorte: court["Nombre Corte"],
        };
        arrayOfRequestObjects.push(request);
      });
    };
  });

  return arrayOfRequestObjects;
};

function createRequests(payloadsArray) {
  let requestsArray = [];
  const requestUrl = "https://www.pjud.cl/ajax/Courts/constitutionOfRoomML/";
  const requestMethod = "post";
  const requestHeaders = {
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
    "Connection": "keep-alive"
  };
  payloadsArray.forEach((requestPayload) => {
    let requestObject = {
      url: requestUrl,
      headers: requestHeaders,
      method: requestMethod,
      payload: requestPayload.payload,
    };

    requestsArray.push(requestObject);
  });

  return [requestsArray, payloadsArray];
};



function readyResponsesForSheet(cleanResponses) {
  const matrixForSheet = cleanResponses.map((cleanResponse) => {
    return [
      cleanResponse.fecha,
      cleanResponse.nomCorte,
      cleanResponse.lugar,
      cleanResponse.caratula,
      cleanResponse.id_ingreso,
      "-proximamente-",
      cleanResponse.numSala,
      "",
      "",
      "",
    ]
  });

  return matrixForSheet;
};

// || RECORDING RESPONSES 

function printArrayToSheet(matrixForSheet) {
  mainDB.getSheetByName("Todo").getRange(2, 1, matrixForSheet.length, matrixForSheet[1].length).setValues(matrixForSheet);
};



function testcreatePayloadsForRequests() {
  const courts = getCourtParameters();
  // const dates = getDateParametersForRequests();
  const dates = ["20/09/2023", "21/09/2023", "22/09/2023"];
  const payloads = createPayloadsForRequests(courts, dates);
  Logger.log("Se van a crear " + payloads.length.toString() + " llamadas a la API");
  const requests = createRequests(payloads);
  // const relatorRequests = createRequestsforRooms(courts);
  // const relatorResponses = asynchronouslyFetchRelatorData(relatorRequests);
  const responses = asynchronouslyFetchTheData(requests);
  const cleanResponses = cleanUpResponses(responses);
  const arrayForPrinting = readyResponsesForSheet(cleanResponses);
  Logger.log("Se van a imprimir " + arrayForPrinting.length.toString() + " filas a la hoja 'Todo'");
  printArrayToSheet(arrayForPrinting);

  return arrayForPrinting;
};

function createThisWeeksSpreadsheet() {

};

function createNecessarySheets() {

};

function filterProcessedData() {

};

function insertFilteredDataIntoCorrespondingSheet() {

};

// PASOS:
// 1. Crear los request 
//   a. Fechas:
//     a.1 Proximo lunes a próximo viernes desde la fecha de ejecución
//     a.2 Deben ser un string en formato chileno
//   b. Salas (número, código, condición):
//     b.1 Todas las que aparezcan enumeradas en la base de datos
//   c. Retornar un array de objetos. Cada objeto es un request 
// 2. Llamar a la API asíncronicamente con 'urlFetchAll'
// 3. Procesar las respuestas (limpiar)
//   a. Extraer la tabla que menciona al relator
//     a.1 Extrar el nombre del relator
//   b. Extraer la tabla que menciona las causas
//     b.1 Extraer el número de causa
//     b.2 Extraer la carátula
//     b.3 Extraer el código de ingreso de la causa
//   c. Retornar array de objetos. Cada objeto es una combinación posible de fecha y sala
// 4. Crear un archivo Sheets en Google Drive que enumere todas las causas con sala asignada para esa semana 
//   a. En ese archivo, crear una hoja general donde estén todos los datos obtenidos
//   b. En ese archivo, crear una hoja por cada corte 
//   c. En ese archivo, crear una hoja para la información filtrada
// 5. Construir a partir del objeto de respuestas construir una matriz de datos
// 6. Pegar la matriz de datos en la hoja correspondiente
// 7. Filtrar la matriz de datos y pegar el resultado en las hojas por cortes
// 8. Filtrar la matriz de datos y pegar el resultado en la hoja de información filtrada
// 9. Aplicar formato a las hojas 



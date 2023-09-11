function myFunction() {
  var myHeaders = new Headers();
myHeaders.append("Accept", "*/*");
myHeaders.append("Accept-Language", "en-US,en;q=0.9,es;q=0.8");
myHeaders.append("Connection", "keep-alive");
myHeaders.append("Cookie", "csrfToken=71c2dbbc0e3a23b085db95e1bf4e6cc3ca675a1b2141f2317223bac498dfa27f05028f1d6dc91fd0dd96342d56482f0c36e9451ccf0ff2a08521fe8817855e33; _gid=GA1.2.43604984.1694363022; CAKEPHP=4cn2qld2avjiujpp048d7599ln; _ga_WKMRR3GSBD=GS1.1.1694363021.1.1.1694366144.0.0.0; _ga=GA1.2.275757827.1694363022; _gat_gtag_UA_179189041_1=1; Cookie_1=value");
myHeaders.append("Origin", "https://www.pjud.cl");
myHeaders.append("Referer", "https://www.pjud.cl/tribunales/corte-suprema");
myHeaders.append("Sec-Fetch-Dest", "empty");
myHeaders.append("Sec-Fetch-Mode", "cors");
myHeaders.append("Sec-Fetch-Site", "same-origin");
myHeaders.append("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36");
myHeaders.append("sec-ch-ua", "\"Chromium\";v=\"116\", \"Not)A;Brand\";v=\"24\", \"Google Chrome\";v=\"116\"");
myHeaders.append("sec-ch-ua-mobile", "?0");
myHeaders.append("sec-ch-ua-platform", "\"Windows\"");

var formdata = new FormData();
formdata.append("numSala", "1");
formdata.append("codCorte", "6050000");
formdata.append("tipoTabla", "3");
formdata.append("fecha", "12/09/2023");
formdata.append("nomsala", "");
formdata.append("condicion", "COSUP");

var requestOptions = {
  method: 'POST',
  headers: myHeaders,
  body: formdata,
  redirect: 'follow'
};

fetch("https://www.pjud.cl/ajax/Courts/constitutionOfRoomML/", requestOptions)
  .then(response => response.text())
  .then(result => console.log(result))
  .catch(error => console.log('error', error));
}

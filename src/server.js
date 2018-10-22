//
//  Pablozg basado en la versión de LuisPa para movistar
//

'use strict';

// Imports
import Utils from './utils';
import CadenasHOME from './cadenasHOME';

import fs from 'fs';
import rp from 'request-promise';
import path from 'path';

//import xml2js from 'xml2js'; // https://github.com/Leonidas-from-XIV/node-xml2js Solo para la prueba de conversión

// Timers
let timerConversion = undefined;
let timerSessionController = undefined;

// =========================================================
// Constantes
// =========================================================

// Versión de la API a usar
const API = '20141201';

let progPreferences = {

	// CADENAS:
	//
	// Variable que apunta al array de cadenas (canales) que voy a
	// usar para los clientes que se conecten por la LAN casera.
	cadenasHOME: CadenasHOME,

	// M3U:
	//
	// Nombre del fichero de salida donde dejaré la lista de canales IPTV de cadenasHOME.js
	ficheroM3U_HOME: '/home/hts/guia/tvsd.m3u',

	// Durante la creación del fichero ficheroM3U_HOME se pone la URL del canal, pero como
	// tenemos dos opciones (UDP o TCP) a continuación debes modificar la siguiente
	// variable para adecuarlo a tu caso concreto.
	//
	// Este prefijo se pondrá delante del valor de "sd_fuente"" que
	// encuentras en el fichero src/cadenas*.js...
	//
	// Ejemplos con UDP y TCP:
	// uri_prefix: 'rtp://@'
	// uri_prefix: 'http://x.x.x.x:yyy/udp/'
	uri_prefix: 'udp://@',

	// Respecto a XMLTV, el objetivo es crear un fichero XMLTV compatible con
	// "http://xmltv.cvs.sourceforge.net/viewvc/xmltv/xmltv/xmltv.dtd"
	//
	// Ficheros XMLTV: En esta versión el proceso crea múltiples ficheros,
	// - Descargo el EPG en formato JSON y los guardo en guia.sd-indice.json y guia.sd-detalles.json
	// - A continuación cambio las "key's" de este fichero a un JSON ya preparado para su traducción sencilla a XMLTV, lo dejo en guia.sd-xmltv.json
	// - Por último hago el proceso contrario, traduzco de JSON a XMLTV y lo salvo en guia.sd-xmltv.xml
	//
	// En resumen:   JSON(sd)->JSON_UNIFICADO(sd)->JSON(xmltv)->XML(xmltv)
	//
	// Ficheros temporales
	rutaFicheros: '/tmp',
	ficheroJsonINDEX: 'guia.sd-indice.json',
	ficheroJsonDetalles: 'guia.sd-detalles.json',
	ficheroJSON: 'guia.sd-xml.json',
	ficheroJSONTV: 'guia.sd-xmltv.json',
	//
	// Fichero final:
	ficheroXMLTV: '/home/hts/guia/guiasd.xml',

	username: 'your username',

	// En formato SHA1
	password: 'your password',

	// Aquí se almacena el token obtenido
	token: '',

	//lineUp: 'ESP-1000132-DEFAULT', // Movistar + - Cable
	lineUp: 'ESP-1000210-DEFAULT', // España (Extendido) - Cable


	// Petición POST, se envia en el cuerpo en formato raw {"username":"munipa", "password":" f9c7ec8b0f67701fe25fe4677ea78bc9e4be65ae"}
	urlToken: 'https://json.schedulesdirect.org/' + API + '/token',

	// https://json.schedulesdirect.org/' + API + '/lineups/ESP-1000132-DEFAULT petición GET
	urlDetalleCadenas: 'https://json.schedulesdirect.org/' + API + '/lineups/',

	// Se envia en el cuerpo la siguiente información y el token en el header, peticion POST
	//[
	//{
	//	"stationID": "20454",
	//	"date": [
	//	"2015-03-13",
	//	"2015-03-17"
	//	]
	//},
	//{
	//	"stationID": "10021",
	//	"date": [
	//	"2015-03-12",
	//	"2015-03-13"
	//	]
	//}
	//]

	urlProgramas: 'https://json.schedulesdirect.org/' + API + '/schedules',

	// Se envia en el cuerpo la siguiente información y el token en el header, peticion POST
	// ["EP020263330158", "EP020721160141"], es un array de los programas
	urlDetallesProgramas: 'https://json.schedulesdirect.org/' + API + '/programs',

	// Se envia en el cuerpo la siguiente información y el token en el header, peticion POST
	// ["EP020263330158", "EP020721160141"], es un array de los programas
	urlMetadataProgramas: 'https://json.schedulesdirect.org/' + API + '/metadata/programs',

	urlImages: 'https://json.schedulesdirect.org/' + API + '/image/',

	dias: 4,

	// Para mostrar métricas en el log.
	numChannels: 0,
	numProgrammes: 0,

	// Gestión interna, permite controlar que mientras que haya una conversión
	// en curso no se saldrá del programa.
	isConversionRunning: false,

	indiceJSON: null,

	detallesJSON: [],

	detallesCanales: null,

	metadataProgramas: [],

	jsontv: null,

	arrayCadenas: [],

	arrayProgramID: [],

	// Modo desarrollador (asume que ya se ha descargado el EPG),
	developerMode: false, // Cambiar a 'false' en producción.

}

// =========================================================
// Funciones
// =========================================================
function creaFicheroM3U(cadenas, cadenas_din, ficheroM3U) {

	// Genero el fichero .m3u (el encoding por defecto es utf8)
	var wstream = fs.createWriteStream(ficheroM3U);
	wstream.write('#EXTM3U\n');
	// añado los canales
	cadenas.map(cadena => {
		if (cadena.tvh_m3u === true) {
			wstream.write(`#EXTINF:-1 tvh-epg="disable" tvh-chnum="${cadena.sd_numero}" tvh-tags="${cadena.tvh_tag}",${cadena.tvh_nombre}\n`);
			if (cadena.tvh_fuente !== undefined) {
				wstream.write(`${cadena.tvh_fuente}\n`);
			} else {
				wstream.write(`${progPreferences.uri_prefix}${cadena.sd_fuente}\n`);
			}
		}
	});
	wstream.end();
}

function rmDir(dirPath, removeSelf) {
	if (removeSelf === undefined)
	removeSelf = true;
	try {
		var files = fs.readdirSync(dirPath);
	} catch (e) {
		return;
	}
	if (files.length > 0)
	for (var i = 0; i < files.length; i++) {
		//var filePath = dirPath + '/' + files[i];
		var filePath = path.join(dirPath, files[i]);
		if (filePath.indexOf("guia.sd") !== -1) {
			if (fs.statSync(filePath).isFile())
			fs.unlinkSync(filePath);
			else
				rmDir(filePath);
			}
		}
		if (removeSelf)
		fs.rmdirSync(dirPath);
	};

	// =========================================================
	// Método principal
	// =========================================================

	function sessionController() {

		let generaM3u = false;

		// Paro mi propio timer, lo re-programaré más tarde
		clearInterval(timerSessionController);

		progPreferences.ficheroJsonINDEX = progPreferences.rutaFicheros + '/' + progPreferences.ficheroJsonINDEX;
		progPreferences.ficheroJsonDetalles = progPreferences.rutaFicheros + '/' + progPreferences.ficheroJsonDetalles;
		progPreferences.ficheroJSON = progPreferences.rutaFicheros + '/' + progPreferences.ficheroJSON;
		progPreferences.ficheroJSONTV = progPreferences.rutaFicheros + '/' + progPreferences.ficheroJSONTV;

		if (!progPreferences.developerMode) rmDir(progPreferences.rutaFicheros, false);

		// Genero array con los canales a descargar y las fechas a solitar
		let arrayFechas = [];

		for (let dias = 0; dias < progPreferences.dias; dias++) {
			arrayFechas.push(Utils.nextDayConFormato(dias));
		}

		progPreferences.cadenasHOME.map(cadena => {
			if (cadena.sd_epg) {
				// Genero la peticion json a enviar en el body
				let channels = {
					"stationID": cadena.sd_id,
					"date": arrayFechas
				};
				progPreferences.arrayCadenas.push(channels);
			}
			if (cadena.tvh_m3u) {
				generaM3u = true;
			}
		});

		// M3U cadenasHOME :
		if (generaM3u) {
			creaFicheroM3U(progPreferences.cadenasHOME, progPreferences.cadenasHOME_din, progPreferences.ficheroM3U_HOME);
		}

		// XMLTV:

		// Inicio el proceso pidiendo el EPG a sd
		console.log('--');
		console.log(`Inicio del ciclo de consulta del EPG`);
		console.log('---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ');
		if (progPreferences.developerMode === false) {
			console.log(`1 - Descargando el EPG en formato JSON desde schedulesdirect.org`);
			console.log(`  => EPG Descargando información para ${progPreferences.dias} días`);

			let token = doRequestToken();
			token.then(function(response) {

				progPreferences.token = response.token;
				console.log(`  => Token recibido correctamente`);

				// Solicitamos la información de los programas para las cadenas activadas
				getChannelsInfo();

				let promiseIndice = doRequestPromise('POST', progPreferences.urlProgramas, '', progPreferences.arrayCadenas);
				promiseIndice.then(function(response) {

					// Grabamos la respuesta como una cadena JSON
					progPreferences.indiceJSON = JSON.parse(JSON.stringify(response));

					// Grabamos el indice en un fichero
					let promiseIndice = writeFile(progPreferences.ficheroJsonINDEX, JSON.stringify(response));
					promiseIndice.then(function() {

						// Creamos array con los id de los programas para solicitar los detalles.
						progPreferences.indiceJSON.map(programa => {
							programa.programs.map(programID => {
								let isProgramStored = progPreferences.arrayProgramID.findIndex(item => item === programID.programID) !== -1 ? true : false;
								if (!isProgramStored) progPreferences.arrayProgramID.push(programID.programID);
							});
						});

						var promises = [];

						// Calculamos el número de peticiones
						let peticiones = Math.ceil(progPreferences.arrayProgramID.length / 500);

						// Solicitamos los detalles de los programas
						console.log(`  => Solicitando metadatos de los programas`);
						for (let i=0; i < peticiones; i++){
							let promiseMetadataInfo = doRequestPromise('POST', progPreferences.urlMetadataProgramas, progPreferences.arrayProgramID.slice(500 * i, 500*(i + 1)), true);
							promises.push(promiseMetadataInfo);
						}

						Promise.all(promises).then(response => {
							response.forEach(function(element) {
								progPreferences.metadataProgramas = progPreferences.metadataProgramas.concat(JSON.parse(JSON.stringify(element)));
							});
							console.log(`  => Recibidos los metadatos para ${progPreferences.metadataProgramas.length} programas correctamente`);

							// Solicitamos los detalles de los programas
							console.log(`  => Solicitando detalles para ${progPreferences.arrayProgramID.length} programas`);

							// Calculamos el número de peticiones
							peticiones = Math.ceil(progPreferences.arrayProgramID.length / 5000);

							// vaciamos las promises anteriores y solicitamos los detalles de los programas
							promises = [];
							for (let i=0; i < peticiones; i++){
								let promiseDetallesProgramas = doRequestPromise('POST', progPreferences.urlDetallesProgramas, progPreferences.arrayProgramID.slice(5000 * i, 5000*(i + 1)), true);
								promises.push(promiseDetallesProgramas);
							}

							Promise.all(promises).then(response => {
								response.forEach(function(element) {
									// Grabamos la respuesta como una cadena JSON
									progPreferences.detallesJSON = progPreferences.detallesJSON.concat(JSON.parse(JSON.stringify(element)));
								});


								let promiseDetalles = writeFile(progPreferences.ficheroJsonDetalles, JSON.stringify(response));
								promiseDetalles.then(function() {
									conversionCompletaDeEPGaXMLTV();
									//console.log('promise completada');
								});

							}).catch(function(err) {
								console.log(err);
							});// Fin del promise de los detalles JSON
						}).catch(function(err) {
							console.log(err);
						});// Fin del promise de los Metadatos
					}).catch(function(err) {
						console.log(err);
					});// Fin de la grabación del Indice
				}).catch(function(err) {
					// POST failed...
					console.log('Error en el POST del Indice')
					console.log(err);
				});//fin promiseIndice
			}).catch(function(err) {
				// POST failed...
				console.log('Error en el POST del Token')
				console.log(err);
			});
		} else {
			//conversionCompletaDeEPGaXMLTV();
			//generaCadenasHOME();
			pruebaConversion();
		}
	}

	function doRequestPromise(method, uri, body, json) {
		var options = {
			method: method,
			uri: uri,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36',
				//'Accept-Encoding': 'deflate,gzip',
				'token': progPreferences.token
			},
			body: body,
			gzip: true,
			json: json // Automatically stringifies the body to JSON
		};

		return rp(options)
		.then(function(response) {
			// POST succeeded...
			return response;
		})
		.catch(function(err) {
			// POST failed...
			return err;
		});
	}

	function doRequestToken(){
		// Descargo primero el token necesario
		var options = {
			method: 'POST',
			uri: progPreferences.urlToken,
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
			},
			body: {
				username: progPreferences.username,
				password: progPreferences.password
			},
			json: true // Automatically stringifies the body to JSON
		};

		console.log(`  => Solicitando Token`);
		return rp(options)
		.then(function(response) {
			// POST succeeded...
			return response;
		})
		.catch(function(err) {
			// POST failed...
			return err;
		});
	}

	function writeFile(filename, datos) {

		return Promise.resolve(
		new Promise(function(resolve, reject) {
			fs.writeFile(filename, datos, function(error) {
				if (error) {
					console.log(`    => Error escribiendo el fichero ${filename}`);
					reject(error);
				} else {
					console.log(`    => El fichero ${filename} se ha grabado correctamente`);
					resolve();
				}
			});
		}));
	}

	function getChannelsInfo(){

		// Solicitamos los detalles de los programas
		console.log(`  => Solicitando información de los canales`);
		let promiseDetallesCanales = doRequestPromise('GET', progPreferences.urlDetalleCadenas + progPreferences.lineUp, '', true);
		promiseDetallesCanales.then(function(response) {
			// Grabamos la respuesta como una cadena JSON
			progPreferences.detallesCanales = JSON.parse(JSON.stringify(response));
			console.log(`  => Recibida información de los canales correctamente`);
		})
		.catch(function(err) {
			console.log(err);
		});
	}

	/*function getMetadataInfo(){

	var promises = [];

	// Calculamos el número de peticiones
	let peticiones = Math.ceil(progPreferences.arrayProgramID.length / 500);

	// Solicitamos los detalles de los programas
	console.log(`  => Solicitando metadatos de los programas`);
	for (let i=0; i < peticiones; i++){
	let promiseMetadataInfo = doRequestPromise('POST', progPreferences.urlMetadataProgramas, progPreferences.arrayProgramID.slice(500 * i, 500*(i + 1)), true);
	promises.push(promiseMetadataInfo);
	}

	Promise.all(promises).then(response => {
	response.forEach(function(element) {
	progPreferences.metadataProgramas = progPreferences.metadataProgramas.concat(JSON.parse(JSON.stringify(element)));
	});
	metadataRequestComplete = true;
	console.log(`  => Recibidos los metadatos para ${progPreferences.metadataProgramas.length} programas correctamente`);
	}, reason => {
	console.log(reason)
	});
	}*/
	
	function pruebaConversion(){
		
		progPreferences.jsontv = {
			tv: {
				"$": {
					"generator-info-name": 'by pablozg, based on LuisPa work',
				},
				channel: [],
				programme: []
			},
		}
		
		let programme = {
        "$": {
          "start": "20181021020500 +0200",
          "stop": "20181021033200 +0200",
          "channel": "AMCESP.es"
        },
        "title": [
          {
            "_": "Desaparecido en Venice Beach",
            "$": {
              "lang": "es"
            }
          }
        ],
        "rating": [
          {
            "_": "MA 15+",
            "$": {
              "system": "Australian Classification Board"
            }
          }          
        ],
        "icon": [
          {
            "$": {
              "src": "https://s3.amazonaws.com/schedulesdirect/assets/173630_ba.jpg"
            }
          }
        ],
        "credits": {
          "actor": [
	          {
	            "_": "Bruce Willis",
	            "$": {
	              "role": "Steve"
	            }
	          },
	          {
	            "_": "John Goodman",
	            "$": {
	              "role": "Dave"
	            }
	          },
	          {
	            "_": "Jason Momoa",
	          },
            "Jason Momoa (Spyder)",
            "Famke Janssen (Katey)",
            "Thomas Middleditch (John)",
            "Christopher McDonald (Mr. Carter)",
            "Maurice Compte (Oscar)",
            "Adam Goldberg (Lew the Jew)",
            "Kal Penn (Rajeesh)",
            "Tyga (Salvatore)",
            "Wood Harris (Prince)",
            "Stephanie Sigman (Lupe)",
            "Adrian Martinez (Actor)"
          ]
        }
      };
		
		progPreferences.jsontv.tv.programme.push(programme);
		
		let builder = new xml2js.Builder({
			headless: false
		}); //true

		// Devuelvo la Conversión
		console.log(builder.buildObject(progPreferences.jsontv));
	}

	function generaCadenasHOME() {

		let canal = {};

		let listadoCadenas = [];

		let token = doRequestToken();
		token.then(function(response) {
			progPreferences.token = response.token;
			console.log(`  => Token recibido correctamente`);

			// Solicitamos los detalles de los programas
			let promiseDetallesCanales = doRequestPromise('GET', progPreferences.urlDetalleCadenas + progPreferences.lineUp, '', true);
			promiseDetallesCanales.then(function(response) {
				// Grabamos la respuesta como una cadena JSON
				progPreferences.detallesCanales = JSON.parse(JSON.stringify(response));

				debugger;

				progPreferences.detallesCanales.stations.forEach(function(element) {

					canal = {
						"sd_epg": false,
						"sd_fuente": "",
						"sd_id": element.stationID,
						"sd_nombre": element.name,
						"sd_numero": "",
						"tvh_id": element.callsign + '.es',
						"tvh_m3u": false,
						"tvh_nombre": element.name,
						"tvh_tag": ""
					}

					if (element.broadcastLanguage[0] === "es-ES") listadoCadenas.push(canal);
				});

				// ordenamos por nombre los canales

				listadoCadenas.sort((a, b) => a.sd_nombre.localeCompare(b.sd_nombre));

				let resultado = 'const cadenasFavoritos =\n' + JSON.stringify(listadoCadenas, null, 2) + ';\n\nexport default cadenasFavoritos;';

				let grabaCadenasHome = writeFile(progPreferences.rutaFicheros + '/cadenasHOME.js', resultado);
				grabaCadenasHome.then(function() {
					console.log('cadenasHOME.js generado correctamente');
				});

			})
			.catch(function(err) {
				console.log(err);
			});
		})
		.catch(function(err) {
			// POST failed...
			console.log('Error en el POST del Token')
			console.log(err);
		});

	}

	// Postprocesa los datos descargados
	function conversionCompletaDeEPGaXMLTV() {
		progPreferences.isConversionRunning = true;

		console.log(`1 - Descarga del EPG en formato JSON - Completada`);

		// Convierto los datos del indice y los detalles de los programas en formato JSON (El Pais) a un único fichero JSON (xmltv)
		console.log(`2 - Convirtiendo JSON a JSONTV`);
		Utils.convierteJSONaJSONTV(progPreferences);

		console.log(`4 - Salvando JSON unificado ${progPreferences.ficheroJSON} - Completado`);
		console.log(`5 - Convirtiendo JSON a JSONTV - Completado`);

		console.log(`6 - Salvando JSONTV ${progPreferences.ficheroJSONTV}`);

		let datosJSONTV = progPreferences.jsontv;

		// Primero el listado de canales
		datosJSONTV.tv.channel.sort((a, b) => a.$.id.localeCompare(b.$.id));

		// Despues por canal y fecha
		datosJSONTV.tv.programme.sort((a, b) => a.$.channel.localeCompare(b.$.channel) || a.$.start.localeCompare(b.$.start));


		fs.writeFile(progPreferences.ficheroJSONTV, JSON.stringify(datosJSONTV, null, 2), function(error) {
			if (error) {
				progPreferences.isConversionRunning = false;
				console.log(`6 - Salvando JSONTV ${progPreferences.ficheroJSONTV} - Fallido`);
				reject(error);
			} else {
				console.log(`6 - Salvando JSONTV ${progPreferences.ficheroJSONTV} - Completado`);

				// Convierto los datos en formato JSONTV a XMLTV
				console.log(`7 - Convirtiendo JSONTV a XMLTV`);
				let datosXMLTV = Utils.convierteJSONTVaXMLTV(datosJSONTV);

				console.log(`7 - Convirtiendo JSONTV a XMLTV - Completado`);

				console.log(`8 - Salvando fichero XMLTV ${progPreferences.ficheroXMLTV}`);
				fs.writeFile(progPreferences.ficheroXMLTV, datosXMLTV, function(error) {
					if (error) {
						progPreferences.isConversionRunning = false;
						console.log(`8 - Salvando fichero XMLTV ${progPreferences.ficheroXMLTV} - Fallido`);
						reject(error);
					}
					console.log(`8 - Salvando fichero XMLTV ${progPreferences.ficheroXMLTV} - Completado`);
					console.log('');
					console.log(`Completado!! - ${progPreferences.numChannels} canales y ${progPreferences.numProgrammes} pases`);
					progPreferences.isConversionRunning = false;
				});
			}
		});
		// Comprobar si la conversión ha finalizado
		// Nota: Se ejecutará inmediatamente (10ms), es un truco
		// para ejecutarlo la primera vez de forma rápida y que él
		// se auto reprograme con el intervalo que desee.
		timerConversion = setInterval(function() {
			monitorConversion();
		}, 10);

	}

	// =========================================================
	// Monitoriza si la conversión ha finalizado
	// =========================================================
	function monitorConversion() {
		// Nada más entrar limpio mi timer, lo activaré después
		// si realmente me hace falta.
		clearInterval(timerConversion);

		// Verifico si sigue activa...
		if (progPreferences.isConversionRunning === true) {
			// Me auto-reprogramo para verificar dentro de 500ms.
			timerConversion = setInterval(function() {
				monitorConversion();
			}, 500);
		}
	}

	// =========================================================
	// START...
	// =========================================================

	// Programo que se arranque el session controller
	// Nota: Se ejecutará inmediatamente (10ms), es un truco
	// para ejecutarlo la primera vez de forma rápida y que él
	// se auto reprograme con el intervalo que desee.
	//
	timerSessionController = setInterval(function() {
		sessionController();
	}, 10);

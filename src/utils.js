//
// pablozg, basado en el trabajo de LuisPa https://github.com/LuisPalacios/tvhstar
//
'use strict';

// Imports
import fs from 'fs';
import xml2js from 'xml2js'; // https://github.com/Leonidas-from-XIV/node-xml2js
import https from 'https';

// Herramientas varias
const utils = {
	nextDayConFormato: function(day) {
		let today = new Date();

		var nextDay = new Date(today);
		nextDay.setDate(today.getDate() + day);

		let YYYY = nextDay.getUTCFullYear();
		let MM = ('0' + (nextDay.getUTCMonth() + 1)).slice(-2);
		let DD = ('0' + nextDay.getUTCDate()).slice(-2);

		return `${YYYY}-${MM}-${DD}`;
	},

	// Convierto el JSON desde formato elmundo a un JSON que será válido para crear el XMLTV.
	//
	convierteJSONaJSONTV: function(progPreferences) {
		// Calcular el Timezone Offset, necesito añadirlo a las fechas
		// de start/stop para ser compatibles Tvheadend.
		let hrs = -(new Date().getTimezoneOffset() / 60)
		let sign = "";
		if (hrs < 0) {
			sign = '-';
		}
		if (hrs > 0) {
			sign = '+';
		}
		let offset = `${sign}${hrs.toLocaleString('es-ES', { minimumIntegerDigits: 2, useGrouping: false })}00`;

		// Empiezo a construir el Objeto JSON que tendrá un formato
		// tal que xml2js.Builder podrá convertirlo a XMLTV directamente...
		//let jsontv = {
		progPreferences.jsontv = {
			tv: {
				"$": {
					"generator-info-name": 'by pablozg, based on LuisPa work',
				},
				channel: [],
				programme: []
			},
		}

		progPreferences.indiceJSON.map(programa => {

			// Busco el indice en cadenasHOME
			let index = progPreferences.cadenasHOME.findIndex(item => item.sd_id === programa.stationID);
			// Busco el indice del canal en los detalles de canales
			let indexDetallesCanales = progPreferences.detallesCanales.stations.findIndex(item => item.stationID === programa.stationID);
			let channel_id = progPreferences.cadenasHOME[index].tvh_id;
			let display_name = progPreferences.cadenasHOME[index].tvh_nombre;

			// A pelo, el lenguaje siempre será 'es'
			let langES = 'es';

			// Para las categorías
			let langEN = 'en';

			// SECCIÓN 'channel'
			// -------------------

			// En el fichero origen (EPG de elmundo) los nombres de los
			// canales vienen dentro de cada 'pase', así que voy a ir
			// descubriéndolos de forma dinámica.

			let isCanalGuardado = progPreferences.jsontv.tv.channel.findIndex(item => item["$"].id === channel_id) !== -1 ? true : false;
			if (!isCanalGuardado) {
				let channel = {
					"$": {
						"id": channel_id
					},
					"display-name": [
					{
						"_": display_name,
						"$": {
							"lang": langES
						}
					}
					]
				};

				if (progPreferences.detallesCanales.stations[indexDetallesCanales].stationLogo){
					channel['icon'] = [
					{
						"$": {
							"src": progPreferences.detallesCanales.stations[indexDetallesCanales].stationLogo[0].URL
						}
					}
					];
				}
				progPreferences.jsontv.tv.channel.push(channel);
				progPreferences.numChannels = progPreferences.numChannels + 1;
			}

			programa.programs.map(programID => {
				// Busco el indice del canal analizado, para mostrar el nombre

				if (progPreferences.indiceJSON.length <= 0) {
					console.log('=============================================')
					console.log('HE RECIBIDO UNA RESPUESTA VACIA !!!!!!!!!!!!!')
					console.log('=============================================')

					return {};

				} else {

					// Busco el indice del programa en los detalles de canales
					let indexDetallesCanales = progPreferences.detallesJSON.findIndex(item => item.programID === programID.programID);

					// Busco el indice del programa en los metadatos
					let indexMetadataProgramas = progPreferences.metadataProgramas.findIndex(item => item.programID === programID.programID);

					let urlImagen = ' ';

					if (indexMetadataProgramas !== -1){

						// Verifico que no contega código de error y exista el uri de la imagen
						if (!progPreferences.metadataProgramas[indexMetadataProgramas].data.code && progPreferences.metadataProgramas[indexMetadataProgramas].data[0].uri){
							// Por el momento solo elijo la primera imagen que contenga
							if (progPreferences.metadataProgramas[indexMetadataProgramas].data[0].uri.indexOf("http") !== -1) {
								urlImagen = progPreferences.metadataProgramas[indexMetadataProgramas].data[0].uri;
							}else{
								urlImagen = progPreferences.urlImages + progPreferences.metadataProgramas[indexMetadataProgramas].data[0].uri;
							}
						}
					}

					// Calculamos la hora de inicio del programa

					let programme_date_start = new Date(programID.airDateTime);
					let programme_date = programme_date_start.toLocaleString('es-ES',{ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second: '2-digit' });
					let [year, month, day] = programme_date.substr(0, 10).split("-");
					let [hours, minutes, seconds] = programme_date.substr(11, 8).split(":");
					let programme_start = `${year}${month}${day}${hours}${minutes}${seconds} ${offset}`;

					// Calculamos la hora de finalización del programa
					programme_date_start.setSeconds(programID.duration);
					programme_date = programme_date_start.toLocaleString('es-ES',{ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second: '2-digit' });
					[year, month, day] = programme_date.substr(0, 10).split("-");
					[hours, minutes, seconds] = programme_date.substr(11, 8).split(":");
					let programme_stop = `${year}${month}${day}${hours}${minutes}${seconds} ${offset}`;

					// Convertimos la fecha original de emision
					if (progPreferences.detallesJSON[indexDetallesCanales].originalAirDate){
						programme_date_start = new Date(progPreferences.detallesJSON[indexDetallesCanales].originalAirDate);
					}else{
						programme_date_start = new Date(programID.airDateTime);
					}
					programme_date = programme_date_start.toLocaleString('es-ES',{ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit', second: '2-digit' });
					[year, month, day] = programme_date.substr(0, 10).split("-");
					programme_date = `${year}${month}${day}`;

					let titulo = progPreferences.detallesJSON[indexDetallesCanales].titles[0].title120;
					let subtitulo = '';

					if (progPreferences.detallesJSON[indexDetallesCanales].episodeTitle150){
						subtitulo = progPreferences.detallesJSON[indexDetallesCanales].episodeTitle150;
					}else{
						subtitulo = titulo;
					}

					let descripcion = '';
					if (progPreferences.detallesJSON[indexDetallesCanales].descriptions){

						descripcion = progPreferences.detallesJSON[indexDetallesCanales].descriptions.description1000[0].description;
					}
					if (descripcion === 'sin descripción') descripcion = '';
					if (descripcion.length > 0) descripcion = '[COLOR orange]Argumento: [/COLOR][CR]' + descripcion;

					//let categoria = utils.getCategoriaByName(progPreferences.detallesJSON[indexDetallesCanales].genres[0]);

					let season = -1;
					let episode = -1;
					let episodeNum = ' ';

					if (progPreferences.detallesJSON[indexDetallesCanales].metadata){
						progPreferences.detallesJSON[indexDetallesCanales].metadata.map(metadata => {
							if (metadata.Gracenote){
								season = parseInt(metadata.Gracenote.season) - 1;
								episode = parseInt(metadata.Gracenote.episode) - 1;
							}
						});
					}

					if (season !== -1 || episode !== -1){
						episodeNum = season.toString() + " . " + episode.toString() + " . 0/1";
						descripcion = '[/COLOR][CR][CR]' + descripcion;

						if (episode !== -1) {episode++; descripcion = 'Episodio ' + episode.toString() + descripcion;}
						if (season !== -1) {
							season++;
							if (episode !== -1){
								descripcion = '[COLOR green]Temporada ' + season.toString() + ' - ' + descripcion;
							}else{
								descripcion = '[COLOR green]Temporada ' + season.toString() + descripcion;
							}
						}

					}

					// --------------------------------------------------------------------------
					// Conversión al nuevo formato
					// --------------------------------------------------------------------------

					// Preparo el pase en el nuevo formato
					//
					let programme = {
						"$": {
							"start": `${programme_start}`,
							"stop": `${programme_stop}`,
							"channel": channel_id
						},
						"title": [
						{
							"_": titulo,
							"$": {
								"lang": langES
							}
						}
						],
						"sub-title": [
						{
							"_": subtitulo,
							"$": {
								"lang": langES
							}
						}
						],
						"desc": [
						{
							"_": descripcion,
							"$": {
								"lang": langES
							}
						}
						],
						"date": [
						{
							"_": `${programme_date}`
						}
						],
						"category": [],
						"rating": []
					};

					// Sacamos la ruta de la imagen
					if (urlImagen !== ' ') {

						programme['icon'] = [
						{
							"$": {
								"src": urlImagen
							}
						}
						];
					}

					// Sacamos la calificación por edades
					if (progPreferences.detallesJSON[indexDetallesCanales].contentRating){
						progPreferences.detallesJSON[indexDetallesCanales].contentRating.map((mapContentRating, index) => {

							if (mapContentRating.country !== 'USA'){
								programme['rating'][index]={
									"_": mapContentRating.code,
									"$": {
										"system": mapContentRating.body
									}
								};
							}else{
								programme['rating'][index]={
									"_": mapContentRating.code,
									"$": {
										"system": "MPAA"
									}
								};
							}
						});
					}

					// Sacamos la calidad de imagen
					if (programID.videoProperties){
						debugger;
						programme['video'] = [
						{
							"quality": utils.quality(programID.videoProperties[0]),
						}
						];

					}

					// Sacamos la calidad del audio
					if (programID.audioProperties){

						if (programID.audioProperties.findIndex(item => item === "stereo") !== -1 ? true : false){
							programme['audio'] = [
							{
								"stereo": "stereo",
							}
							];
						}

					}

					// Añadimos los generos
					if (progPreferences.detallesJSON[indexDetallesCanales].genres){
						progPreferences.detallesJSON[indexDetallesCanales].genres.map((mapGenres, index) => {
							programme['category'][index]={
								"_": mapGenres,
								"$": {
									"lang": "en"
								}
							};
						});
					}

					// Añadimos el reparto si existe, falta arreglar la forma de incluirlos
					if (progPreferences.detallesJSON[indexDetallesCanales].cast){
						debugger;

						programme['credits'] = {};
						let tempCredits = [];

						// Creamos array con los roles existentes.
						progPreferences.detallesJSON[indexDetallesCanales].cast.map((mapCast,indexRoles) => {
							mapCast.role = mapCast.role.toLowerCase().split(" ",1).toString();
							// Si no existe la categoria la creo
							if (!programme['credits'][mapCast.role]) programme['credits'][mapCast.role] = [];

							let credits = {}
							if (mapCast.characterName){
								credits = {
									"_": mapCast.name,
									"$": {
										"role": mapCast.characterName
									}
								};
							}else{
								credits = {
									"_": mapCast.name
								};
							}
							programme['credits'][mapCast.role].push(credits);
						});
					}

					// Añado el episodio en caso de estar definido
					if (season !== -1 || episode !== -1){
						programme['episode-num'] = [
						{
							"_": episodeNum,
							"$": {
								"system": "xmltv_ns"
							}
						}
						];
					}/*else{
					programme['episode-num'] = [
					{
					"_": episodeNum,
					"$": {
					"system": "onscreen"
					}
					}
					];
					}*/

					// Añado el programa al buffer de salida
					progPreferences.jsontv.tv.programme.push(programme);
					progPreferences.numProgrammes = progPreferences.numProgrammes + 1;

				} // Fin else indiceJSON.length

			}); // Fin bucle programas
		}); // Fin bucle indice

	}, // Fin Funcion convierteJSONaJSONTV,

	quality: function (videoQuality) {

		switch (videoQuality) {

			case 'hdtv':
			case 'enhanced':
			return 'HD';

			case 'uhdtv':
			return "UHD";

			case 'sdtv':
			return "576";

			default:
			return videoQuality;
		}
	},

	// Convierto de formato JSONTV a XMLTV
	convierteJSONTVaXMLTV: function(datosJSONTV) {
		// Preparo el builder
		let builder = new xml2js.Builder({
			headless: false
		}); //true

		// Devuelvo la Conversión
		return builder.buildObject(datosJSONTV);
	},

}

export default utils;

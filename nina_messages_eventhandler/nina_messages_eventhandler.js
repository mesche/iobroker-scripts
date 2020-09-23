//
//===================================================================
//	                NINA - Messages - Eventhandler
//		                -- VERSION 0.1.0  --
//
// This script iterates over the data which have been provided by the ioBroker.nina adapter.
// The prepared messages can be processed to other systems (e.g. pushover, telegram...)
// 
// Internals
// ---------- 
// The script creates a state for every ags to store the message-ids that have already been sent.
// Example: javascript.0.nina.Eventhandler.<AGS>.msgssend
//
// Prerequisites
// ------------- 
// Adapter - ioBroker.nina - https://github.com/TA2k/ioBroker.nina
//
//
// Webservice
// ----------
// AGS Keys:    https://warnung.bund.de/assets/json/suche_channel.json
// URL Config:  https://warnung.bund.de/bbk.config/config_rel.json
// AGS Status:  https://warnung.bund.de/bbk.status/status_<AGS_FILL_0_TO_12_PLACES>.json 
// Msg By ID:   https://warnung.bund.de/<BUCKET_NAME>/<REF_ID>.ohne.json
// Msg Lists:   https://warnung.bund.de/bbk.mowas/gefahrendurchsagen.json
//              https://warnung.bund.de/meldungen
//
// Examples:    https://warnung.bund.de/bbk.status/status_110000000000.json 
//              https://warnung.bund.de/bbk.mowas/DE-NW-BN-SE030-20200506-30-001.ohne.json                                           
//              https://warnung.bund.de/bbk.archive.mowas/DE-BY-TS-W135-20200922-000_20200922115355.json    
//
//
//    ::::::::::::::: www.blogging-it.com :::::::::::::::
//    
// Copyright (C) 2020 Markus Eschenbach. All rights reserved.
// 
// 
// This software is provided on an "as-is" basis, without any express or implied warranty.
// In no event shall the author be held liable for any damages arising from the
// use of this software.
// 
// Permission is granted to anyone to use this software for any purpose,
// including commercial applications, and to alter and redistribute it,
// provided that the following conditions are met:
// 
// 1. All redistributions of source code files must retain all copyright
//    notices that are currently in place, and this list of conditions without
//    modification.
// 
// 2. All redistributions in binary form must retain all occurrences of the
//    above copyright notice and web site addresses that are currently in
//    place (for example, in the About boxes).
// 
// 3. The origin of this software must not be misrepresented; you must not
//    claim that you wrote the original software. If you use this software to
//    distribute a product, an acknowledgment in the product documentation
//    would be appreciated but is not required.
// 
// 4. Modified versions in source or binary form must be plainly marked as
//    such, and must not be misrepresented as being the original software.
//    
//    ::::::::::::::: www.blogging-it.com :::::::::::::::
//===================================================================


// ***** CONFIGURATION ******

var debuggingActive = true; // active/disable debugging log messages
var noSendOnFirstAgsRun = true; // true = do not send infos on first run to avoid to infos for old messages

var sendToPushover = false; // Pushover adapter needed
var sendToTelegram = false; // Telegram adapter needed
var sendToTelegramUser = '<USER>'; // the Telegram user

var ninaAdapter = 'nina';
var ninaAdapterInstance = '0';
var idConfigBase = 'javascript.' + instance  + '.' + ninaAdapter + '.Eventhandler';
var idConfigAgsMsgsSendTemplate = idConfigBase + '.{0}.msgssend';
var msgTemplate = 'NINA - {0} {1}{NL}Datum: {2}{NL}Ort: {3}{NL}Typ: {4}{NL}Maßnahmen: {5}{NL}{NL}{6}{NL}{NL}{7}';
var nl = '\n';
var defaultFormatDate = 'TT.MM.JJJJ';
var defaultFormatDateTime = defaultFormatDate + ' SS:mm:ss';

// ***** CONFIGURATION ******


/**
 * Array contains entries of possible types of the message.
 * Last entry is the fallback for undefined/unknown values.
 * 
 * Entry: Key | Label | Icon
 * 
 * Keys:
 *   Alert       ❗  new threat
 *   Update      🔺  threat update  
 *   Cancel      ❌  cancel threat
 *   Unknown     ❓  undefined/unknown threat type value
 * 
 */
var MSG_TYPES = [
  ['Alert', 'Warnung', '❗'],
  ['Update', 'Aktualisierung', '🔺'], 
  ['Cancel', 'Entwarnung', '❌'],
  ['Unknown', 'Unbekannt', '❓']
];


/*
 * Array contains entries of possible severities of the message.
 * Last entry is the fallback for undefined/unkonwn values.
 * 
 * Entry: Key | Label | Icon
 * 
 * Keys:
 *   Extreme      🟣   extraordinary threat to life or property
 *   Severe       🔴   significant threat to life or property  
 *   Moderate     🟠   possible threat to life or property  
 *   Minor        🟡   minimal to no known threat to life or property  
 *   None         ⚪   none to no known threat to life or property  
 *   Unknown      ⚫   severity unkown threat
 * 
*/
var MSG_SEVERITIES =  [
  ['Extreme', 'Sehr hoch', '🟣'],
  ['Severe', 'Hoch', '🔴'],
  ['Moderate', 'Mäßig', '🟠'],
  ['Minor', 'Gering', '🟡'],
  ['None', 'Keine', '⚪'],
  ['Unknown', 'Unbekannt', '⚫']
];


/*
 * Array contains entries of possible responsive action urgencies of the message.
 * Last entry is the fallback for undefined/unkonwn values.
 * 
 * Entry: Key | Label | Icon
 * 
 * 
 * Keys:
 *   Immediate        responsive action SHOULD be taken immediately
 *   Expected         responsive action SHOULD be taken soon (within next hour)
 *   Future           responsive action SHOULD be taken in the near future
 *   Past             responsive action is no longer required
 *   Unknown          urgency not known
 * 
*/
var MSG_URGENCIES =  [
  ['Immediate', 'Sofort', '🟥'],
  ['Expected', 'Als Nächstes', '🟨'],
  ['Future', 'Zeitnah', '🟩'],
  ['Past', 'Vorbei', '🟦'],
  ['Unknown', 'Unbekannt', '⬛']
];

/**
 * Gives out the message into log if debugging is active
 * 
 * @param msg the message string 
 * 
 */
function debug(msg) {
    if(debuggingActive){
        log(msg);
    }
}

/**
 * Returns the value of the state with the given id.
 * Return null if state does not exist. 
 * 
 * @param id the id of the state
 * 
 * @return the value of the state or null if state does not exist.
 * 
 */
function stVal(id) {
    return (existsState(id)) ? getState(id).val : null;
}

/**
 * Returns the common name of the object description with the given id.
 * Return null if the object does not exist. 
 * 
 * @param id the id of the object description
 * 
 * @return the common name or if the object does not exist.
 * 
 */
function objName(id) {
    var obj = getObject(id);
    return (obj) ? obj.common.name : null;
}

/**
 * Formats the given date object or milliseconds to a string with the date infos.
 * 
 * @param msOrDate number of milliseconds or date object
 * 
 * @return a string with the date infos.
 * 
 */
function formatToDate(msOrDate) {
    return formatDate(msOrDate, defaultFormatDate);
}

/**
 * Formats the given date object or milliseconds to a string with the date and time infos.
 * 
 * @param msOrDate number of milliseconds or date object
 * 
 * @return a string with the date and time infos.
 * 
 */
function formatToDateTime(msOrDate) {
    return formatDate(msOrDate, defaultFormatDateTime);
}

/**
 * Returns the native data of the object description with the given adapter name and instance no.
 * 
 * @param adapterName the name of the system adapter
 * @param instanceNo the number of the instance
 * 
 * @return the native data of the object description
 * 
 */
function getSysAdapterNative(adapterName, instanceNo) {
    return getObject('system.adapter.' + adapterName + '.' + instanceNo).native;
}

/**
 * Lookup of the corresponding info in the given array.
 * Returns the info of with label text and icon.
 * 
 * @param val the lookup key 
 * @param arr the array with the infos
 * @param iconOnly return the icon only without the label
 * 
 * @return the info of with label text and icon
 *  
 */
function getLabelInfo(val, arr, iconOnly) {
    var idx = arr.length-1; // fallback value as default
    
    for (var i=0; i < arr.length; i++) {
        if(arr[i][0].toLowerCase() === val.toLowerCase()){
            idx = i;
            break;
        }
    }    
    return arr[idx][2] + ((iconOnly) ? '' : ' ' + arr[idx][1]);
}

/**
 * Normalize the given string. 
 * 
 * @param text the string to normalize
 * 
 * @return the normalized string.
 * 
 */
function normalizeText(text) {
    return text.replace(/<br\s*\/?>/mg, nl); // replace <br/> with new line
}

/**
 * Replace the placeholders in the given string with the given paramerters.
 * 
 * @param str the string with the placeholders
 * @param params the array with the paramerters to replace
 * 
 * @return the formatted string
 */
function stringFormat(str, params) {
    params = (typeof params === 'string') ? [params] : params;
    var strNew = str.replace(new RegExp('\\{NL\\}', 'gm'), nl); // replace specifiers with new line 
    for (var i = 0; i < params.length; i++) {             
        strNew = strNew.replace(new RegExp('\\{' + i + '\\}', 'gm'), params[i]);
    }
    return strNew;
}

/**
 * Search for a specified value within an array
 * and return the index if found or -1 if not found.
 * 
 * @param arr an array through which to search
 * @param value the value to search for
 * 
 * @return the index if found or -1 if not
 */
function arrayContains(arr, value){
    var i = arr.length;
    while (i--) {
       if (arr[i] === value) {
           return i;
       }
    }
    return -1;
}

/**
 * Process the message data which have been provided by the ioBroker.nina adapter of the given AGS.
 * The prepared messages will be processed to other systems (e.g. Pushover, Telegram...)
 * 
 * @params ags Process the messages for this AGS  
 */
function processMessagesForAgs(ags) {
  var idNinaDevice = ninaAdapter + '.' + ninaAdapterInstance + '.' + ags;
  var idNumberOfWarn = idNinaDevice + '.numberOfWarn';
  var idWarningBase = idNinaDevice + '.warnung';

  var numberOfWarnings = stVal(idNumberOfWarn);
  var agsName = objName(idNinaDevice);

  debug('Iterate over ' + numberOfWarnings + ' messages from ' + agsName);

  var mgsSendList = readConfigAgsMsgsSend(ags);
  var isFirstAgsRun = mgsSendList == null;
  
  if(!mgsSendList){ 
    mgsSendList = [];
  }
  
  // TODO maybe better load all data at once
  // $(idWarningBase + '*').each(function(id, i) {debug(id);});
  for (var idx=1; idx <= numberOfWarnings; idx++ ) {
    var idWarning = idWarningBase + ((idx == 1) ? '0' : '') + idx;
    
    var msgId = stVal(idWarning + '.identifier');
    
    if(isFirstAgsRun && noSendOnFirstAgsRun) {
        mgsSendList.push(msgId);
        debug('First run for AGS ' + agsName + ' - Do not send the message');
        continue;
    }else if(arrayContains(mgsSendList, msgId) !== -1) {
        debug('Message ' + msgId + ' has already been sent for AGS ' + agsName);
        continue;
    }

    mgsSendList.push(msgId);

    var idWarningInfo = idWarning + '.info01';
    var msgHeadline = stVal(idWarningInfo + '.headline');
    var msgDescr = stVal(idWarningInfo + '.description');
    var msgEvent = stVal(idWarningInfo + '.event');
    var msgSeverity = stVal(idWarningInfo + '.severity');
    var msgUrgency = stVal(idWarningInfo + '.urgency');

    var msgType = stVal(idWarning + '.msgType');
    var msgSent = stVal(idWarning + '.sent');

    var msgSentDateStr = formatToDateTime(getDateObject(msgSent));

    debug(stringFormat('Message - id: {0} send: {1} severity: {2}', [msgId, msgSentDateStr, msgSeverity]));

    var msgTypeLabel = getLabelInfo(msgType, MSG_TYPES, false);
    var msgSeverityLabel = getLabelInfo(msgSeverity, MSG_SEVERITIES, true);
    var msgUrgencyLabel = getLabelInfo(msgUrgency, MSG_URGENCIES, false);

    var msgParams = [msgEvent, msgSeverityLabel, msgSentDateStr, agsName, msgTypeLabel, msgUrgencyLabel, msgHeadline, msgDescr];
    var msgText = normalizeText(stringFormat(msgTemplate, msgParams));

    sendMsgTo(msgText);
  }

  writeConfigAgsMsgsSend(ags, mgsSendList);
}

/**
 * Reads the stored message-ids array for the given AGS of that have already been sent.
 * 
 * @param ags Read the stored message-ids array for this AGS
 * 
 * @return array of message-ids that have already been sent
 * 
 */
function readConfigAgsMsgsSend(ags) {
    var idConfig = stringFormat(idConfigAgsMsgsSendTemplate, ags);

    debug('Read config for AGS ' + ags + ' from state with id: ' + idConfig);
    var valueStr = stVal(idConfig);
    return (valueStr) ? JSON.parse(valueStr) : null;
}

/**
 * Store the message-ids array that have already been sent for the given AGS.
 * If the state does not exists, it will be created.
 * 
 * @param ags Store the message-ids for this AGS
 * @param ags The array of message-ids that have already been sent
 * 
 */
function writeConfigAgsMsgsSend(ags, agsMgsSendList) {
  var agsMgsSendListJson = JSON.stringify(agsMgsSendList);
  var idConfig = stringFormat(idConfigAgsMsgsSendTemplate, ags);
  debug('Write config for AGS ' + ags + ' to state with id: ' + idConfig);
    
  if(existsState(idConfig)){
    setState(idConfig, {val: agsMgsSendListJson});
  } else {    
    createState(idConfig, {val: agsMgsSendListJson, def: '',
                           name: 'message-ids that have already been sent', 
                           type: 'string', role: 'text', 
                           read: true, write: true}
    );
  }
}

/**
 * Sends the given text to other systems (e.g. pushover, telegram...).
 * See configuration to enable/disable it.
 *
 * @param text the text to send
 * 
 */
function sendMsgTo(text) {
    debug('Send: ' + text);
    if(sendToPushover){
        sendTo('pushover', text);
    }

    if(sendToTelegram) {
        sendTo('telegram', {user: sendToTelegramUser, text: text});
    }
}

/**
 * Reads the configured AGS values of the ioBroker.nina adapter.
 * Iterates over the list and starts further processing.
 * 
 */
function main(){
  var ninaData = getSysAdapterNative(ninaAdapter, ninaAdapterInstance);
  var ninaAgsArr = ninaData.agsArray.split(',').map(item=>item.trim());
  for (const ags of ninaAgsArr){
    processMessagesForAgs(ags);
  }
}

schedule('*/15 * * * *', main); // triggered every 15 minutes
 
main(); // run on startup


// Creates template given a list of gAST addresses
// call with "js makeTemplate.js srcfile destDirectory"
// example: "js makeTemplate.js gAST/list templates"
// srcfile is contains list of gAST file addresses, one
// on each line

// GIANT TODO: pull from mongodb, not locally hosted text
// file. Ask Xiang about this
//
// current:
// multiple locally hosted gAST JSON ->-> list of addresses -> makeTemplate -> templates written to directory
//
// potential:
// mongodb table of gAST JSON -> table name, mongodb address/port (what else is needed?) -> templates written as entries to new table in mondodb (better options?) 

// load required
var fs = require('fs');	// file write and read

// Check call, get source and destination addresses
numOfArgs = process.argv.length;
if (numOfArgs != 4){
	console.log("improper call. Call with:\njs makeTemplate.js srcfile destDirectory");
	return;
}

srcAddr = process.argv[2];
destAddr = process.argv[3];

// get list
fs.readFile(srcAddr, 'utf8', function (err,data) {
	if (err) {
		console.log("Bad list source address: " + srcAddr);
		return;
	}
	makeTemplate(data, false);
});

// gASTarr global
var gASTarr = [];
var gASTarrMark = [];
var gASThash = [];
var gASThashUniq = [];
var uniqToAll = [];
var templateArr = [];
var toSave = [];

function makeTemplate(gASTlist, ifDone){
	// get gAST and make to objects from path first
	if (!ifDone){
		gASTarr = gASTlist.split("\n");	// split list into array of addresses
		cleanArr(gASTarr);	// clean the array

		// copy to array of all zeros, marking callback status for readin
		gASTarrMark = new Array(gASTarr.length + 1).join('0').split('').map(parseFloat);	// 0 if unread, 1 if string, 2 if object

		// read in gAST objects to gASTarr
		readin();
		return;
	}

	// make hashes for each gAST
	gASThash = makeHash();
	// find unique hashes, this is our list of gAST types
	gASThashUniq = removeDuplicates(gASThash);
	// array with which gASTarr have matching hashes for gASThashUniq
	uniqToAll = getuniqToAll();
	// make the templates
	templateArr = getTemplateArr();
	// result array with template and hash
	toSave = getToSave();

	//save to destination
	console.log("Writing templates to \"" + destAddr + "\"");
	for (i in toSave){
		writeAddr = destAddr + "/template" + String(i);
		fs.writeFile(writeAddr, toSave[i], function (err) {
			if (err){return console.log("Could not write to destination path")}
			else {
				//console.log("Template written to: " + writeAddr);
			}
		});
	}
}

// cleanArr
// Checks all array elements and removes any "unclean"
// or unwanted elements i.e. empty or broken elements
// elements should be paths to gAST JSON objects
function cleanArr(){
	for (i in gASTarr){
		if 	
		(
			(gASTarr[i] == "") || 			// empty
			(gASTarr.length <= 2) //||		// probably meaningless
		)
		{
			gASTarr.splice(i, 1);			// remove
		}
	}	
}

// readin
// given array of addresses to gAST and array of ints
// indicating if they've been read in yet, convert from
// addresses to JSON strings to gAST objects
function readin(){
	for (i in gASTarrMark){
		if (gASTarrMark[i] == 0){	// unread -> string
			fs.readFile(gASTarr[i], 'utf8', function (err,data) {
				if (err){
					console.log("Couldn't read in \"" + gASTarr[i] + "\"");
					return;
				}
				gASTarr[i] = data;
				gASTarrMark[i] = 1;
				readin(gASTarr, gASTarrMark);
			});
			return;
		}
		else if (gASTarrMark[i] == 1){	// string -> object
			gASTarr[i] = JSON.parse(gASTarr[i]);
			gASTarrMark[i] = 2;
			//readin(gASTarr, gASTarrMark);
		}

		// if done, move on
		if (getIfDone()){
			makeTemplate(null, true);
			return;
		}
	}
}

// getIfDone
// true if all elements in gASTarr are processed and are now gAST objects
// checks gASTarrMark for all 2's
function getIfDone(){
	if (gASTarrMark.reduce(function(pv, cv) { return pv + cv; }, 0) == (gASTarrMark.length * 2)){
		return true;
	}
	return false;
}

// makeHash
// make hashes for each gAST
function makeHash(){
	for (i in gASTarr){
		gASThash[i] = makeHashR(gASTarr[i], "");
	}

	return gASThash;
}

// makeHashR
// recursive step for makehash
function makeHashR(obj, hash){
	// check
	if (typeof obj != "object"){
		console.log("error, cannot make hash: item is not a gAST object");
	}

	// traverse all nested nodes
	for(var key in obj) {
		if (getIfNode(key)){
			hash = makeHashR(obj[key], hash);
			hash = hash.concat(key);
			hash = hash.concat(", ");
			hash = hash.concat(obj.tag);
			hash = hash.concat("; ");
		}
	}

	return hash;
}

// getIfNode
// true if object is a gAST node
// i.e. if the name begins with "node"
function getIfNode(key){
	if (key.substring(0, 4) == "node"){
		return true;
	}
	return false;
}

// removeDuplicates
// remove duplicate entries in an array
// used to find unique gAST templates from array of many hashes
function removeDuplicates(a) {
    var prims = {"boolean":{}, "number":{}, "string":{}}, objs = [];

    return a.filter(function(item) {
        var type = typeof item;
        if(type in prims)
            return prims[type].hasOwnProperty(item) ? false : (prims[type][item] = true);
        else
            return objs.indexOf(item) >= 0 ? false : objs.push(item);
    });
}

// getuniqToAll
// populates the ith element of uniqToAll
// with the indexes of all hashes in gASThash
// that match gASThashUniq[i]
function getuniqToAll(){
	for (i in gASThashUniq){
		uniqToAll[i] = [];
		for (j in gASThash){
			if (gASThashUniq[i] == gASThash[j]){
				uniqToAll[i].push(parseInt(j));
			}
		}
	}

	return uniqToAll;
}

// getTemplateArr
// looks at all gAST that match a certain hash
// and create a JSON template for that hash
// one to one with gASThashUniq
function getTemplateArr(){
	// for each hash, make a template
	// gASThashUniq[i] -> JSON template -> templateArr[i]
	for (i in uniqToAll){
		// make temporary template
		tempTemplate = gASTarr[uniqToAll[i][0]];
		// for that template, get the total node count
		nodeCount = tempTemplate.count;
		// for each node
		for (k=1; k<nodeCount; k++){
			tempNodeValues = []; tempTemplateNode = {};
			// for each gAST, get that one node's values
			for (j in uniqToAll[i]){
				thisNode = getNode(gASTarr[uniqToAll[i][j]], "node" + String(k))
				if (thisNode != undefined){tempNodeValues.push(thisNode.value);}
			}
			// determine type and value for that template node
			tempTemplateNode.tag = getNode(gASTarr[uniqToAll[i][0]], "node" + String(k)).tag;
			tempTemplateNode.value = getTemplateNodeValue(tempNodeValues);
			// write to tempTemplate
			tempTemplateNodeToWrite = getNode(tempTemplate, "node" + String(k));
			tempTemplateNodeToWrite.tag = tempTemplateNode.tag;
			tempTemplateNodeToWrite.value = tempTemplateNode.value;
		}
		templateArr[i] = tempTemplate;
	}

	return templateArr;
}

// getNode
// return the node "name" nested within gAST object "gAST"
function getNode(gAST, name){
	// for all nested nodes
	for(var key in gAST) {
		if (getIfNode(key)){
			// compare
			if (key == name){
				// console.log("returning: " + gAST[key]);
				// console.log("returning has value: " + gAST[key].value); 
				gotNode = gAST[key];
			}
			// traverse
			getNode(gAST[key], name);
		}
	}
	return gotNode;
}

// getTemplateNodeValue
// given array of template node values
// determine what the corresponding template node should be
function getTemplateNodeValue(arr){
	// CONST
	if (ifCONST(arr)){return "CONST"};
	// ENUM
	if (ifENUM(arr)){return "ENUM"};
	// NUMBER
	if (IFNUMBER(arr)){return "NUMBER"};
	// URI
	if (ifURI(arr)){return "URI"};
	// GAST
	if (ifGAST(arr)){return "GAST"};
	// REGEXP
	if (ifREGEXP(arr)){return "REGEXP"};
	// WILDCARD
	return 'WILDCARD';
}

// ifCONST
// true if all elements in an array are the same
function ifCONST(arr){
	for (i in arr){
		if (arr[i] != arr[0]){
			return false;
		}
	}
	return true;
}

// ifENUM
// true if the sample size is larger than threshold (120)
// and number of different values is significantly smaller
// (<= 5)
function ifENUM(arr){
	if (arr.length < 120){return false;}
	numOfUnique = [...new Set(arr)].length;
	if (arr.length - numOfUnique < 5){return false;}
	return true;
}

// ifNUMBER
function IFNUMBER(arr){
	for (i in arr){
		if (isNaN(arr[i])){
			return false
		}
	}
	return true;
}

// ifURI
function ifURI(arr){
	function isURL(s) {
		var regexp = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/
		return regexp.test(s);
	}
	for (i in arr){
		if (!isURL(String(arr[i]))){return false;}
	}
	return true;
}

// ifGAST
function ifGAST(arr){
	function getIfGAST(obj){
		if (typeof obj != "object"){return false;}
		if (obj.tag == undefined){return false;}
		return true;
	}
	for (i in arr){
		if (!getIfGAST(arr[i])){return false;}
	}
	return true;
}

// ifREGEXP
// TODO
function ifREGEXP(arr){
	
	return false
}

// toSave
// combines gASThashUniq and templateArr to make an array of JSON objects
// each object.hash has the hash and object.template has the template
// each element is stringified
function getToSave(){
	for (i in gASThashUniq){
		toSave[i] = {}; tempObj = {};
		tempObj.hash = gASThashUniq[i];
		tempObj.template = templateArr[i];
		toSave[i] = JSON.stringify(tempObj);
	}
	return toSave;
}
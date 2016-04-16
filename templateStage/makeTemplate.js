// Creates template given where scripts are hosted on
// MongoDB server

// call with "node makeTemplate.js"
// example: "node makeTemplate.js"

// writes to database: webcontents, collection: template_domainName
// example - database: webcontents, collection: template_cnn.com

// INCLUDE
// file write/read
var fs = require('fs');
var url = require('url');
// MongoDB
var Db = require('mongodb').Db,
    MongoClient = require('mongodb').MongoClient,
    Server = require('mongodb').Server,
    ReplSetServers = require('mongodb').ReplSetServers,
    ObjectID = require('mongodb').ObjectID,
    Binary = require('mongodb').Binary,
    GridStore = require('mongodb').GridStore,
    Grid = require('mongodb').Grid,
    Code = require('mongodb').Code,
    // BSON = require('mongodb').pure().BSON,
    assert = require('assert');
// Esprima
var esprima = require('esprima');
var tools = require('templateTools.js');

// global stuff in here
dat = {
	scripts: [],		// array of scripts read in
	url: [],			// array of url objects
	ASTs: [],			// array of ASTs
	gASTs: [],			// array of gASTs
	hashes: [],			// array of hashes
	uniqHashes: [],		// array of unique hashes
	hashToGAST: [],		// array of arrays containing indexes of gASTs with that uniqHash
	templates: [],		// array of templates
	toWrite: [],		// array of objects with .hash from uniqHashes and .template from templates
}

// Check call, get source and destination addresses
numOfArgs = process.argv.length;
if (numOfArgs > 3){
	console.log("improper call. Call with:\nnode makeTemplate.js");
	return;
}

// these used to be passed in, are now hardcoded
// srcCollection = String(process.argv[3]);
// destCollection = String(process.argv[4]);
srcCollection = "purescripts";
destCollection = "templates";
dbName = "webcontents";

// optional database option
if (numOfArgs == 3){
	dbName = String(process.argv[2]);
}


// get scripts, flow continues at function "gotScripts"
MongoClient.connect("mongodb://localhost:27017/" + dbName, {native_parser:true}, function(err, db) {
	assert.equal(null, err);
	var cursor = db.collection(srcCollection).find();
	cursor.each(function(err, doc) {
		assert.equal(err, null);
		if (doc != null) {
			dat.scripts.push(doc);
		} else {
			db.close();
			main();
		}
	});
});

// main()
	// scripts in array dat.scripts
	// each element is object with fields
	// hostname, script, url
	// these fields contain strings
	// for each script, make AST, gAST, hash
	// flow continues at makeTemplate
function main(){
	// decode from base64, get url
	dat.scripts = tools.processScripts(dat.scripts);
	// make ASTs
	dat.ASTs = tools.makeASTs(dat.scripts);
	// make gASTs
	dat.gASTs = tools.makegASTs(dat.ASTs);
	// make hashes
	dat.hashes = tools.makeHashes(dat.gASTs);
	// make unique hashes
	dat.uniqHashes = tools.makeUniqHashes(dat.hashes);
	// map uniqHashes to original gASTs
	dat.hashToGAST = tools.makeHashToGAST(dat.uniqHashes, dat.hashes);
	// make templates using unique hashes and original gasts
	dat.templates = tools.makeTemplates(dat.hashToGAST, dat.gASTs);
	// construct objects to write to the database
	dat.toWrite = tools.makeToWrite(dat.templates, dat.uniqHashes);
	// write to the database
	// flow does not return after this function
	tools.writeToDatabase(dbName, destCollection, dat.toWrite);
	return;
}

// // processScripts()
// 	// given input array of script objects, decode string in 
// 	// "script" field from base 64
// 	// also gets url and path
// function processScripts(inArray){
// 	outArray = [];
// 	for (i in inArray){
// 		tempObj = {};
// 		tempObj.script = (new Buffer(inArray[i].script, 'base64')).toString();	// decode
// 		if (validScriptString(tempObj.script)){
// 			dat.url.push(getDomain(inArray[i].url));			
// 			outArray.push(tempObj);
// 		}
// 	}
// 	return outArray

// 	// ------------------------------- functions

// 	function validScriptString(str){
// 		if  ((str == "//thistagisintentionallyblank") ||
// 			(str.length < 3) ||
// 			(str == null) ||
// 			(str == "null") ||
// 			(str == undefined) ||
// 			(str == "undefined")){
// 			return false
// 		}
// 		return true;
// 	}

// 	function getDomain(url) {
// 		if (url == undefined){
// 			return '';
// 		}

// 		var hostName = getHostName(url);
// 		var domain = hostName;

// 		if (hostName != null) {
// 			var parts = hostName.split('.').reverse();

// 			if (parts != null && parts.length > 1) {
// 				domain = parts[1] + '.' + parts[0];

// 				if (hostName.toLowerCase().indexOf('.co.uk') != -1 && parts.length > 2) {
// 					domain = parts[2] + '.' + domain;
// 				}
// 			}
// 		}

// 		return domain;
// 	}

// 	function getHostName(url) {
// 		var match = url.match(/:\/\/(www[0-9]?\.)?(.[^/:]+)/i);
// 		if (match != null && match.length > 2 && typeof match[2] === 'string' && match[2].length > 0) {
// 			return match[2];
// 		}
// 		else {
// 			return null;
// 		}
// 	}	

// }

// // makeASTs
// 	// input: array of scripts
// 	// output: array of ASTs using esprima
// function makeASTs(inArray){
// 	outArray = [];
// 	for (i in inArray){
// 		outArray[i] = esprima.parse(inArray[i].script);
// 	}
// 	function trim(string){
// 		// strings always have ( at the beginning and )(); at the end
// 		// remove these
// 		if ((string[0] = "(") && (string[string.length - 1] == ";")){
// 			string = string.slice(1, string.length - 4)
// 		}
// 		return string;
// 	}
// 	return outArray;
// }

// // makegASTs
// 	// input: array of ASTs (objects)
// 	// output: array of gASTs (objects)
// function makegASTs(inArray){
// 	outArray = [];
// 	for (i in inArray){
// 		// write gAST of inArray[i] to outArray[i]
// 		traverseTree(inArray[i], "outArray[i]", 0);
// 	}
// 	return outArray;

// 	// traverseTree
// 		// given remaining AST object and path to gAST so far,
// 		// process immediate level of object and traverse children
// 	function traverseTree(object, path, gASTcount){
// 		// check current object
// 		if(object.type != undefined){
// 			// make node object with null tag and value properties
// 			if (typeof eval(path) != "object"){
// 				eval(path + "={tag: null, value: null,};");
// 			}
// 			else {
// 				eval(path + ".tag = null; " + path + ".value = null;");
// 			}

// 			// get node tag and value
// 			nodeInfo = processNode(object);

// 			// set node tag and value
// 			if (nodeInfo.tag != null){
// 		   		eval(path + ".tag = \"" + String(nodeInfo.tag) + "\";");
// 			}
// 			if (nodeInfo.value != null){
// 				eval(path + ".value = \"" + String(nodeInfo.value) + "\";");
// 			}

// 			// handle complex data nodes, return nonnested object
// 			if (node.needsNonNested){
// 				makeNonNestedObject(object, path, 0);
// 				// do not traverse any more
// 				return
// 			}

// 			// increment node id
// 			gASTcount++;
// 			eval("outArray[i].count = " + gASTcount + ";");
// 		}


// 		// traverse all, do something for only objects and arrays
// 		for(var key in object) {
// 	    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
// 			// node
// 			if(object[key].type != undefined){
// 				//console.log("node");
// 				traverseTree(object[key], path + ".node" + gASTcount, gASTcount);
// 			}
// 			// array
// 			else if (object[key].length >= 1){
// 				//console.log("array");
// 				traverseTree(object[key], path, gASTcount);
// 			}
// 			// nonnode object
// 			else { 
// 				//console.log("nonnode object");
// 				traverseTree(object[key], path, gASTcount);
// 			}
// 	    }
// 		}
// 	}

// 	// processNode
// 		/*
// 		Process Node: these are nodes that should be written to the gAST
// 		Nodes are always AST objects, and always have type field
// 		AST contains more information than needed, so not all AST objects are nodes
// 		Chief goal of this function is to determin tag and value of the gAST node

// 		esprima types are same as mozilla spidermonkey api
// 		https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API

// 		node.tag: tag for that gAST node
// 		node.value: value for that gAST node
// 		node.needsNonNested: control variable, true if gAST node needs to be a nonnested
// 			object. NOT to be written literally to that gAST node
// 		*/
// 	function processNode(object){
// 		node = {tag: null, value: null, needsNonNested: null};
// 		switch (object.type){
// 			// structure nodes (dowhile, if)
// 			// operator nodes (assign, binop)
// 			// tag = classname (assign, dowhile)
// 			// value = null
// 			case "VariableDeclaration":
// 				node.tag = object.kind;
// 				break;
// 			case "CallExpression":
// 			case "Program":
// 			case "VariableDeclarator":
// 				node.tag = object.type;		
// 				break;

// 			// identifier nodes (identifier)
// 			// tag = node value (CNN, configobj)
// 			// value = null
// 			case "Identifier":
// 				node.tag = object.name;
// 				break;

// 			// atomic data node (number, string)
// 			// tag = classname (number, string)
// 			// value = node value	(politics/...gwx.cnn)
// 			case "Literal":
// 				node.tag = typeof object.value;
// 				node.value = object.value;
// 				break;

// 			// complex data node (array, object)
// 			// tag = class name (array, object)
// 			// value = nonnested object
// 			case "ObjectExpression": 		// parent representing object
// 			case "ArrayExpression": 		// parent representing array
// 				node.tag = typeof object.value;
// 				node.needsNonNested = true;
// 				break;

// 			// other node
// 			// tag = class name (object.type)
// 			case "Property":
// 			case "ObjectPattern":
// 			case "ArrayPattern":
// 			case "IfStatement":
// 			case "SwitchStatement":
// 			case "BreakStatement":
// 			case "ContinueStatement":
// 			case "WithStatement":
// 			case "SwitchCase":
// 			case "NewExpression":
// 			case "WhileStatement":
// 			case "DoWhileStatement":
// 			case "ForStatement":
// 			case "ForInStatement":
// 			case "ForOfStatement":
// 			case "ReturnStatement":
// 			case "FunctionDeclaration":	
// 			case "FunctionExpression":
// 			case "BlockStatement":
// 			case "ExpressionStatement":
// 			case "LabeledStatement":
// 			case "ThrowStatement":
// 			case "TryStatement":
// 			case "LetStatement":
// 			case "DebuggerStatement":
// 			case "EmptyStatement":
// 			case "ThisExpression":
// 			case "ArrowExpression":
// 			case "SequenceExpression":
// 			case "UnaryExpression":
// 			case "BinaryExpression":
// 			case "AssignmentExpression":
// 			case "UpdateExpression":
// 			case "LogicalExpression":
// 			case "ConditionalExpression":
// 			case "MemberExpression":
// 			case "YieldExpression":
// 			case "ComprehensionExpression":
// 			case "GeneratorExpression":
// 			case "GraphExpression":
// 			case "GraphIndexExpression":
// 			case "LetExpression":
// 			case "CatchClause":
// 			case "ComprehensionBlock":
// 			case "ComprehensionIf":
// 			case "XMLDefaultDeclaration":
// 			case "XMLAnyName":
// 			case "XMLQualifiedIdentifier":
// 			case "XMLFunctionQualifiedIdentifier":
// 			case "XMLAttributeSelector":
// 			case "XMLFilterExpression":
// 			case "XMLElement":
// 			case "XMLList":
// 			case "XMLEscape":
// 			case "XMLText":
// 			case "XMLStartTag":
// 			case "XMLEndTag":
// 			case "XMLPointTag":
// 			case "XMLName":
// 			case "XMLAttribute":
// 			case "XMLCdata":
// 			case "XMLComment":
// 			case "XMLProcessingInstruction":
// 				node.tag = object.type;
// 				break;
// 			default:
// 				node.tag = object.type;
// 				console.log("new (unknown) case to add to switch of type: " + object.type);
// 				break;
// 		}
// 		return node;
// 	}

// 	// makeNonNestedObject
// 		/*
// 		makeNonNestedObject
// 		makes a non nested object for object, at path (of the gAST)
// 		traverses everything in the object (the else case)
// 		writes to the nonnested object if there is a literal
// 		*/
// 	function makeNonNestedObject(object, path, depth){
// 		// make nonnestedobject if not exist
// 		// only happens on the first call before recursion
// 		if ((eval(path + ".value") == null) || (eval(path + ".value") == undefined)){
// 			eval(path + ".tag = \"non_nested_obj\"");
// 			eval(path + ".value = {}");
// 		}

// 		// traverse all, do something for only objects and arrays
// 		for(var key in object) {
// 	    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
// 			// node
// 			if(object[key].type != undefined){
// 				doTag(object[key], path, depth);
// 			}
// 			// to if((object.hasOwnProperty(key)) &&traverse
// 			else {
// 				makeNonNestedObject(object[key], path, depth);
// 			}
// 	    }
// 		}
// 	}

// 	// doTag
// 		/*
// 		called when something needs to be written to the nonnested object at "path"
// 		take that object, find how to write it, and write it
// 		check if the array to be written to already exists, write accordingly
// 		*/
// 	function doTag(object, path, depth){
// 		switch (object.type){
// 			case "ArrayExpression":
// 				// parent node of an array
// 				// continue traversal with depth++
// 			case "ObjectExpression":
// 				// parent node of an object
// 				// continue traversal with depth++
// 				makeNonNestedObject(object, path, depth+1);
// 				break;
// 			case "elements":
// 				// elements of an array, array elements in here
// 				// don't do anything until seeing the elements
// 				// traverse to see the elements
// 			case "properties": 
// 				// array containing object properties (the case below this)
// 				// don't do anything until seeing each property element
// 				// traverse to see the properties
// 				makeNonNestedObject(object, path, depth);	// seeing the elements/properties
// 				break;
// 			case "Property":
// 				// property of an object, value in .key.name
// 				pushPath = path + ".value." + String(object.key.name);
// 				pushValue = "\"" + String(object.value.value) + "\"";
// 				pushToNonNested(pushPath, pushValue);
// 				break;	// not doing anything
// 			case "Identifier":
// 				// pushPath = path + ".value.CSP_identifier";
// 				// pushValue = object.name;
// 				// pushToNonNested(pushPath, pushValue);
// 				return; // do nothing, identifier is insignificant
// 			case "Literal":
// 				if (object.value == null){
// 					return;
// 				}
// 				// something to write to array for
// 				switch (typeof object.value){
// 					case "number":
// 						pushPath = path + ".value.CSP_number";
// 						pushValue = object.value;
// 						pushToNonNested(pushPath, pushValue);
// 						break;
// 					case "string":
// 						pushPath = path + ".value.CSP_string_lev" + depth;
// 						pushValue = "\"" + object.value + "\"";
// 						pushToNonNested(pushPath, pushValue);
// 						break;
// 					case "boolean":
// 						pushPath = path + ".value.CSP_boolean";
// 						pushValue = object.value;
// 						pushToNonNested(pushPath, pushValue);
// 						break;
// 					default:
// 						console.log("unhandled typeof for literal type in nonnested handler with typeof: " + typeof object.value);
// 				}
// 				break;
// 			default:
// 				console.log("unhandled dotag case of type: " + object.type);
// 				break;
// 		}
// 	}

// 	// pushToNonNested
// 		/*
// 		pushes pushValue to array at pushPath
// 		*/
// 	function pushToNonNested(pushPath, pushValue){
// 		// make array if not exist
// 		if (eval(pushPath) == undefined){
// 			eval(pushPath + "=[]");
// 		}
// 		// write to
// 		//console.log("pushPath0: " + pushPath );
// 		eval(pushPath  + ".push(" + pushValue + ")");
// 	}
// }

// // makeHashes
// 	// input: array of gASTS (object types)
// 	// output: array of hashes (string types)
// function makeHashes(inArray){
// 	outArray = [];
// 	for (i in inArray){
// 		outArray[i] = makeHash(inArray[i], "");
// 	}
// 	return outArray;

// 	// recursively traverse the gAST to make the hash
// 	function makeHash(obj, hash){
// 		// check
// 		if (typeof obj != "object"){
// 			console.log("error, cannot make hash: item is not a gAST object");
// 		}

// 		// traverse all nested nodes
// 		for(var key in obj) {
// 			if (getIfNode(key)){
// 				hash = makeHash(obj[key], hash);
// 				hash = hash.concat(key);
// 				hash = hash.concat(": tag=");
// 				hash = hash.concat(obj.tag);
// 				hash = hash.concat(", value=");
// 				hash = hash.concat(obj.value);
// 				hash = hash.concat("; ");
// 			}
// 		}

// 		return hash;

// 		// getIfNode
// 		// true if object is a gAST node
// 		// i.e. if the name begins with "node"
// 		function getIfNode(key){
// 			if (key.substring(0, 4) == "node"){
// 				return true;
// 			}
// 			return false;
// 		}
// 	}
// }

// // makeUniqHashes
// 	// input: an array of hashes
// 	// output: an array of unique hashes, duplicates removed
// function makeUniqHashes(hashArr){
//     var prims = {"boolean":{}, "number":{}, "string":{}}, objs = [];

//     return hashArr.filter(function(item) {
//         var type = typeof item;
//         if(type in prims)
//             return prims[type].hasOwnProperty(item) ? false : (prims[type][item] = true);
//         else
//             return objs.indexOf(item) >= 0 ? false : objs.push(item);
//     });
// }

// // makeHashToGAST
// 	// input: array of unique hashes, subset of array of hashes
// 	// output: mapping of unique hashes to the hashes they came from
// 	// ex: [A, B, C], [A, A, C, B, C] -> [[0, 1], [3], [2, 4]]
// 	// map uniqHashes to original gASTs
// function makeHashToGAST(uniqHash, allHash){
// 	mapArr = [];

// 	for (i in uniqHash){
// 		mapArr[i] = [];
// 		for (j in allHash){
// 			if (uniqHash[i] == allHash[j]){
// 				mapArr[i].push(parseInt(j));
// 			}
// 		}
// 	}

// 	return mapArr;
// }

// // makeTemplates
// 	// input: 	mapping (each element has indexes to matched gASTS)
// 	//			gasts
// 	// output: 	a template for each element in the mapping (for each group of gASTS)
// 	// 			(with each node containing a key for later matching, see paper)
// 	// templateArr: array of templates to return
// 	// tempTemplate: the current template being worked on (object tree)
// 	// tempTemplateNode: the current node being worked on (object)
// 	// tempTemplateNodeToWrite: the instance of tempTemplateNode inside tempTemplate
// 	// tempNodeValues: array of values contained in all instances of a certain node
// 	// 		used to determine type/key
// function makeTemplates(mapArr, gasts){
// 	// temp to store templates to before returning
// 	templateArr = [];
// 	// for each hash, make a template
// 	for (i in mapArr){
// 		// temporary template
// 		tempTemplate = gasts[mapArr[i][0]];
// 		// get total node count
// 		nodeCount = tempTemplate.count;
// 		// for each node
// 		for (k=1; k<nodeCount; k++){
// 			tempNodeValues = []; tempTemplateNode = {};
// 			for (j in mapArr[i]){
// 				thisNode = getNode(gasts[mapArr[i][j]], "node" + String(k));
// 				if (thisNode != "error: not node not found"){tempNodeValues.push(thisNode.value);}
// 			}
// 			// determine type and value for that template node
// 			tempTemplateNode.tag = getNode(tempTemplate, "node" + String(k)).tag;
// 			tempTemplateNode.value = getTemplateNodeStuff(tempNodeValues).value;
// 			tempTemplateNode.info = getTemplateNodeStuff(tempNodeValues).info;
// 			// write to tempTemplate
// 			tempTemplateNodeToWrite = getNode(tempTemplate, "node" + String(k));
// 			tempTemplateNodeToWrite.tag = tempTemplateNode.tag;
// 			tempTemplateNodeToWrite.value = tempTemplateNode.value;
// 			tempTemplateNodeToWrite.info = tempTemplateNode.info;
// 		}
// 		templateArr.push(tempTemplate);
// 	}

// 	return templateArr;

// 	// ------------------- functions

// 	// getNode
// 	// return the node "name" nested within gAST object "gAST"
// 	function getNode(gAST, name){
// 		// for all nested nodes
// 		for(var key in gAST) {
// 			if (getIfNode(key)){
// 				// compare
// 				if (key == name){
// 					// console.log("returning: " + gAST[key]);
// 					// console.log("returning has value: " + gAST[key].value); 
// 					return gAST[key];
// 				}
// 				// traverse
// 				return getNode(gAST[key], name);
// 			}
// 		}
// 		return "error: not node not found";
// 	}

// 	// getIfNode
// 	// true if object is a gAST node
// 	// i.e. if the name begins with "node"
// 	function getIfNode(key){
// 		if (key.substring(0, 4) == "node"){
// 			return true;
// 		}
// 		return false;
// 	}

// 	// getTemplateNodeValue
// 	// given array of template node values
// 	// determine what the corresponding template node should be
// 	function getTemplateNodeStuff(arr){
// 		toReturn = {};
// 		// CONST
// 		if (ifCONST(arr)){
// 			toReturn.value = "CONST";
// 			toReturn.info = arr[0];
// 		};
// 		// ENUM
// 		if (ifENUM(arr)){
// 			toReturn.value = "ENUM";
// 			toReturn.info = getEnumInfo(arr);
// 		};
// 		// NUMBER
// 		if (IFNUMBER(arr)){
// 			toReturn.value = "NUMBER";
// 		};
// 		// URI
// 		if (ifURI(arr)){
// 			toReturn.value = "URI";
// 			toReturn.info = getURIInfo(arr);
// 		};
// 		// GAST
// 		if (ifGAST(arr)){
// 			toReturn.value = "GAST";
// 		};
// 		// REGEXP
// 		if (toReturn.value == undefined){
// 			toReturn.value = "REGEXP";
// 			toReturn.info = getREGEXP(arr);
// 		};

// 		return toReturn;

// 		// ifCONST
// 		// true if all elements in an array are the same
// 		function ifCONST(arr){
// 			for (i in arr){
// 				if (arr[i] != arr[0]){
// 					return false;
// 				}
// 			}
// 			return true;
// 		}

// 		// ifENUM
// 		// true if the sample size is larger than threshold (120)
// 		// and number of different values is significantly smaller
// 		// (<= 5)
// 		function ifENUM(arr){
// 			if (arr.length < 120){return false;}
// 			numOfUnique = (new Set(arr)).size;
// 			if (arr.length - numOfUnique < 5){return false;}
// 			return true;
// 		}

// 		// return array of legal enum values
// 		function getEnumInfo(arr){
// 			// gets only unique values
// 			return Array.from(new Set(arr));
// 		}

// 		// ifNUMBER
// 		function IFNUMBER(arr){
// 			for (i in arr){
// 				if (isNaN(arr[i])){
// 					return false
// 				}
// 			}
// 			return true;
// 		}

// 		// ifURI
// 		function ifURI(arr){
// 			function isURL(s) {
// 				var regexp = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/
// 				return regexp.test(s);
// 			}
// 			for (i in arr){
// 				if (!isURL(String(arr[i]))){return false;}
// 			}
// 			return true;
// 		}

// 		// returns array of legal domains
// 		function getURIInfo(arr){
// 			// make array of strings into domains
// 			for (i in arr){
// 				arr[i] = extractDomain(arr[i]);
// 			}

// 			// make unique
// 			for (i in arr){
// 				arr = Array.from(new Set(arr));
// 			}

// 			return arr;

// 			function extractDomain(url) {
// 			    var domain;
// 			    //find & remove protocol (http, ftp, etc.) and get domain
// 			    if (url.indexOf("://") > -1) {
// 			        domain = url.split('/')[2];
// 			    }
// 			    else {
// 			        domain = url.split('/')[0];
// 			    }

// 			    //find & remove port number
// 			    domain = domain.split(':')[0];

// 			    return domain;
// 			}
// 		}

// 		// ifGAST
// 		function ifGAST(arr){
// 			for (i in arr){
// 				if (!getIfGAST(arr[i])){return false;}
// 			}
// 			return true;

// 			function getIfGAST(obj){
// 				if (obj == null){return false;}
// 				if (typeof obj != "object"){return false;}
// 				if (obj.tag == undefined){return false;}
// 				return true;
// 			}
// 		}

// 		// getREGEXP
// 		function getREGEXP(arr){
// 			if (arr[0] == null){return}
// 			var min = arr[0].length; var max = arr[0].length;
// 			for (i in arr){
// 				if (arr[i].length < min){min = arr[i].length;}
// 				if (arr[i].length > max){max = arr[i].length;}
// 			}
// 			// ^.{0,150}$
// 			return "^.{" + min + "," + max + "}$";
// 		}		
// 	}
// }

// // makeToWrite
// 	// construct objects to write to the database
// 	// input: array of templates, array of hashes
// 	// output: array of objects where each object has:
// 	// 				- .template from templates
// 	// 				- .hash from .hashes 
// 	//				- .host from script.url.host
// 	//				- .path from script.url.path
// function makeToWrite(templates, hashes){
// 	toWrite = [];
// 	for (i in templates){
// 		toWrite[i] = {};
// 		toWrite[i].template = templates[i];
// 		toWrite[i].hash = hashes[i];
// 		toWrite[i].domain = dat.url[dat.hashToGAST[i][0]];
// 	}

// 	return toWrite;
// }

// // writeToDatabase
// 	// write to the database
// 	// input: array of objects to write, db and collection to write to
// 	// action: writes each element in the array as a single entry to that db/collection
// 	// output: 1 if successful, 0 if not
// function writeToDatabase(dbToWrite, collectionToWrite, toWriteDat){
// 	// push each template into hostContainer under domain string as tag
// 	hostContainer = {};
// 	for (i in toWriteDat){
// 		if (hostContainer[toWriteDat[i].domain] == undefined){
// 			hostContainer[toWriteDat[i].domain] = [];
// 		}
// 		hostContainer[toWriteDat[i].domain].push(toWriteDat[i]);
// 	}

// 	// for each unique domain, write to collection
// 	for (tag in hostContainer){
// 		writeToCollection(dbToWrite, "template_" + tag, hostContainer[tag]);
// 	}

// 	// functions ----------------------------------------------------------

// 	function writeToCollection(dbToWrite, collectionToWrite, toWriteColl){
// 		console.log("writing to: " + dbToWrite + ", " + collectionToWrite);
// 		// connect to database
// 		MongoClient.connect('mongodb://localhost:27017/' + dbToWrite, function(err, db) {
// 			// get collection
// 			templateCollection = db.collection(collectionToWrite);
// 			//assert.equal(null, err);
// 			// insert new stuff
// 			templateCollection.insertMany(toWrite, function(err, r) {
// 				assert.equal(null, err);
// 				assert.equal(toWrite.length, r.insertedCount);
// 				db.close();
// 			});
// 		});
// 	}
// }


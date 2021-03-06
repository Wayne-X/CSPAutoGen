// Creates gAST given an AST
// call with "js makeGAST.js ASTAddress gASTAddress"
// example: "js makeGAST.js AST/test1 gAST/test1"
//

// load required
var fs = require('fs');	// file write and read

// global gAST
var gAST = {
	count: 0,
};


// Check call, get source and destination addresses
numOfArgs = process.argv.length;
if (numOfArgs != 4){
	console.log("improper call. Call with:\njs makeGAST.js ASTAddress gASTAddress");
	return;
}

srcAddr = process.argv[2];
destAddr = process.argv[3];

// get AST
fs.readFile(srcAddr, 'utf8', function (err,data) {
	if (err) {
		console.log("Bad script source address: " + srcAddr);
		return;
	}
	//console.log("ASTString: " + data.slice(0, 0+30));
	makeGAST(data);
});

// make gAST
function makeGAST(ASTString){
	ASTObject = JSON.parse(ASTString); // get AST in object form


	traverseTree(ASTObject, "gAST");

	var gASTString = JSON.stringify(gAST);	// convert to string form for storage

	//save to destination
	console.log("Writing gAST to \"" + destAddr + "\"");
	fs.writeFile(destAddr, gASTString, function (err) {
	  if (err){return console.log("Could not write to destination path")}
		//else {console.log("Success");};
	});
}

///////////////////////////////////////////////////////////////////
// HELPER FUNCTIONS
//////////////////////////////////////////////////////////////////

/*
Traverse tree
*/
function traverseTree(object, path){
	// check current object
	if(object.type != undefined){
		// make node object with null tag and value properties
		if (typeof eval(path) != "object"){
			eval(path + "={tag: null, value: null,};");
		}
		else {
			eval(path + ".tag = null; " + path + ".value = null;");
		}
		// get node tag and value
		nodeInfo = processNode(object);
		// set node tag and value
		if (nodeInfo.tag != null){
	   		eval(path + ".tag = \"" + String(nodeInfo.tag) + "\";");
		}
		if (nodeInfo.value != null){
			eval(path + ".value = \"" + String(nodeInfo.value) + "\";");
		}

		// handle complex data nodes, return nonnested object
		if (node.needsNonNested){
			makeNonNestedObject(object, path, 0);
			// do not traverse any more
			gAST.count++;
			return
		}

		// increment node id
		gAST.count++;
		//console.log("node count: " + gAST.count);
		//console.log(object.type);
	}


	// traverse all, do something for only objects and arrays
	for(var key in object) {
    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
		// node
		if(object[key].type != undefined){
			//console.log("node");
			traverseTree(object[key], path + ".node" + gAST.count);
		}
		// array
		else if (object[key].length > 1){
			//console.log("array");
			traverseTree(object[key], path);
		}
		// nonnode object
		else { 
			//console.log("nonnode object");
			traverseTree(object[key], path);
		}
    }
	}
}

/*
Process Node: these are nodes that should be written to the gAST.
Nodes are always AST objects, and always have type field
AST contains more information than needed, so not all AST objects are nodes
Chief goal of this function is to determin tag and value of the gAST node

esprima types are same as mozilla spidermonkey api
https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API

node.tag: tag for that gAST node
node.value: value for that gAST node
node.needsNonNested: control variable, true if gAST node needs to be a nonnested
	object. NOT to be written literally to that gAST node
*/
function processNode(object){
	node = {tag: null, value: null, needsNonNested: null};
	switch (object.type){
		// structure nodes (dowhile, if)
		// operator nodes (assign, binop)
		// tag = classname (assign, dowhile)
		// value = null
		case "VariableDeclaration":
			node.tag = object.kind;
			break;
		case "CallExpression":
		case "Program":
		case "VariableDeclarator":
			node.tag = object.type;		
			break;

		// identifier nodes (identifier)
		// tag = node value (CNN, configobj)
		// value = null
		case "Identifier":
			node.tag = object.name;
			break;

		// atomic data node (number, string)
		// tag = classname (number, string)
		// value = node value	(politics/...gwx.cnn)
		case "Literal":
			node.tag = typeof object.value;
			node.value = object.value;
			break;

		// complex data node (array, object)
		// tag = class name (array, object)
		// value = nonnested object
		case "ObjectExpression": 		// parent representing object
		case "ArrayExpression": 		// parent representing array
			node.tag = typeof object.value;
			node.needsNonNested = true;
			break;

		// other node
		// tag = class name (object.type)
		case "Property":
		case "ObjectPattern":
		case "ArrayPattern":
		case "IfStatement":
		case "SwitchStatement":
		case "BreakStatement":
		case "ContinueStatement":
		case "WithStatement":
		case "SwitchCase":
		case "NewExpression":
		case "WhileStatement":
		case "DoWhileStatement":
		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
		case "ReturnStatement":
		case "FunctionDeclaration":	
		case "FunctionExpression":
		case "BlockStatement":
		case "ExpressionStatement":
		case "LabeledStatement":
		case "ThrowStatement":
		case "TryStatement":
		case "LetStatement":
		case "DebuggerStatement":
		case "EmptyStatement":
		case "ThisExpression":
		case "ArrowExpression":
		case "SequenceExpression":
		case "UnaryExpression":
		case "BinaryExpression":
		case "AssignmentExpression":
		case "UpdateExpression":
		case "LogicalExpression":
		case "ConditionalExpression":
		case "MemberExpression":
		case "YieldExpression":
		case "ComprehensionExpression":
		case "GeneratorExpression":
		case "GraphExpression":
		case "GraphIndexExpression":
		case "LetExpression":
		case "CatchClause":
		case "ComprehensionBlock":
		case "ComprehensionIf":
		case "XMLDefaultDeclaration":
		case "XMLAnyName":
		case "XMLQualifiedIdentifier":
		case "XMLFunctionQualifiedIdentifier":
		case "XMLAttributeSelector":
		case "XMLFilterExpression":
		case "XMLElement":
		case "XMLList":
		case "XMLEscape":
		case "XMLText":
		case "XMLStartTag":
		case "XMLEndTag":
		case "XMLPointTag":
		case "XMLName":
		case "XMLAttribute":
		case "XMLCdata":
		case "XMLComment":
		case "XMLProcessingInstruction":
			node.tag = object.type;
			break;
		default:
			node.tag = object.type;
			console.log("new (unknown) case to add to switch of type: " + object.type);
			break;
	}
	return node;
}

/*
makeNonNestedObject
makes a non nested object for object, at path (of the gAST)
traverses everything in the object (the else case)
writes to the nonnested object if there is a literal
*/
function makeNonNestedObject(object, path, depth){
	// make nonnestedobject if not exist
	// only happens on the first call before recursion
	if ((eval(path + ".value") == null) || (eval(path + ".value") == undefined)){
		eval(path + ".tag = \"non_nested_obj\"");
		eval(path + ".value = {}");
	}

	// traverse all, do something for only objects and arrays
	for(var key in object) {
    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
		// node
		if(object[key].type != undefined){
			doTag(object[key], path, depth);
		}
		// to if((object.hasOwnProperty(key)) &&traverse
		else {
			makeNonNestedObject(object[key], path, depth);
		}
    }
	}
}


/*
dotag
called when something needs to be written to the nonnested object at "path"
take that object, find how to write it, and write it
check if the array to be written to already exists, write accordingly
*/
function doTag(object, path, depth){
	switch (object.type){
		case "ArrayExpression":
			// parent node of an array
			// continue traversal with depth++
		case "ObjectExpression":
			// parent node of an object
			// continue traversal with depth++
			makeNonNestedObject(object, path, depth+1);
			break;
		case "elements":
			// elements of an array, array elements in here
			// don't do anything until seeing the elements
			// traverse to see the elements
		case "properties": 
			// array containing object properties (the case below this)
			// don't do anything until seeing each property element
			// traverse to see the properties
			makeNonNestedObject(object, path, depth);	// seeing the elements/properties
			break;
		case "Property":
			// property of an object, value in .key.name
			pushPath = path + ".value." + String(object.key.name);
			pushValue = "\"" + String(object.value.value) + "\"";
			pushToNonNested(pushPath, pushValue);
			break;	// not doing anything
		case "Identifier":
			// pushPath = path + ".value.CSP_identifier";
			// pushValue = object.name;
			// pushToNonNested(pushPath, pushValue);
			return; // do nothing, identifier is insignificant
		case "Literal":
			if (object.value == null){
				return;
			}
			// something to write to array for
			switch (typeof object.value){
				case "number":
					pushPath = path + ".value.CSP_number";
					pushValue = object.value;
					pushToNonNested(pushPath, pushValue);
					break;
				case "string":
					pushPath = path + ".value.CSP_string_lev" + depth;
					pushValue = "\"" + object.value + "\"";
					pushToNonNested(pushPath, pushValue);
					break;
				case "boolean":
					pushPath = path + ".value.CSP_boolean";
					pushValue = object.value;
					pushToNonNested(pushPath, pushValue);
					break;
				default:
					console.log("unhandled typeof for literal type in nonnested handler with typeof: " + typeof object.value);
			}
			break;
		default:
			console.log("unhandled dotag case of type: " + object.type);
			break;
	}
}

/*
pushToNonNested
pushes pushValue to array at pushPath
*/
function pushToNonNested(pushPath, pushValue){
	// make array if not exist
	if (eval(pushPath) == undefined){
		eval(pushPath + "=[]");
	}
	// write to
	//console.log("pushPath0: " + pushPath );
	eval(pushPath  + ".push(" + pushValue + ")");
}
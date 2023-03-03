"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const path = require("path");
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
const activate = (context) => {
    const serverModule = context.asAbsolutePath(path.join("out", "server.js"));
    const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
            options: debugOptions,
        },
    };
    const clientOptions = {
        // Register the server for plain text documents
        documentSelector: [
            { scheme: "file", language: "html" },
            { scheme: "file", language: "latex" },
            { scheme: "file", language: "review" },
            { scheme: "file", language: "plaintext" },
            { scheme: "file", language: "markdown" },
        ],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contain in the workspace
            fileEvents: vscode_1.workspace.createFileSystemWatcher("**/.clientrc"),
        },
    };
    client = new node_1.LanguageClient("languageServerTextlint", "Language Server Textlint", serverOptions, clientOptions);
    client.start();
};
exports.activate = activate;
const deactivate = () => {
    if (!client) {
        return undefined;
    }
    return client.stop();
};
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
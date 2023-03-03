"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable prettier/prettier */
const path = require("path");
const textlint_1 = require("textlint");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const node_1 = require("vscode-languageserver/node");
const vscode_uri_1 = require("vscode-uri");
const rule_1 = require("./rules/rule");
// サーバーへの接続を作成(すべての提案された機能も含む)
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// テキストドキュメントを管理するクラスを作成します。
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    hasConfigurationCapability =
        (capabilities.workspace && !!capabilities.workspace.configuration) ?? false;
    return {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
        },
    };
});
connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
});
const getDefaultTextlintSettings = () => {
    const mySettings = {};
    rule_1.DEFAULT_EXTENSION_RULES.forEach((value) => {
        mySettings[value.ruleName] = value.enabled;
    });
    return mySettings;
};
const defaultSettings = {
    maxNumberOfProblems: 1000,
    textlint: getDefaultTextlintSettings(),
};
let globalSettings = defaultSettings;
const documentSettings = new Map();
connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    }
    else {
        globalSettings = (change.settings["japanese-proofreading"] ||
            defaultSettings);
    }
    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
});
/**
 * VSCode側の設定を取得します。
 */
const getDocumentSettings = (resource) => {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: "japanese-proofreading",
        });
        documentSettings.set(resource, result);
    }
    return result;
};
// Only keep settings for open documents
documents.onDidClose((close) => {
    documentSettings.delete(close.document.uri);
    resetTextDocument(close.document);
});
// ドキュメントを初めて開いた時と内容に変更があった際に実行します。
documents.onDidChangeContent(async (change) => {
    validateTextDocument(change.document);
});
const configFilePath = path.resolve(__dirname, "../.textlintrc");
// バリデーション（textlint）を実施
const validateTextDocument = async (textDocument) => {
    // VSCode側の設定を取得
    const settings = await getDocumentSettings(textDocument.uri);
    const document = textDocument.getText();
    const descriptor = await (0, textlint_1.loadTextlintrc)({ configFilePath });
    // ファイルの拡張子
    const ext = path.extname(textDocument.uri);
    // サポートされている拡張子
    const targetExtension = descriptor.availableExtensions.find((i) => i === ext) ?? null;
    // 対応していない拡張子の場合、バリデーションを実行しない
    if (targetExtension === null) {
        return;
    }
    const linter = (0, textlint_1.createLinter)({
        descriptor,
    });
    const results = await linter.lintText(document, vscode_uri_1.URI.parse(textDocument.uri).fsPath);
    const diagnostics = [];
    // エラーが存在する場合
    if (results.messages.length) {
        // エラーメッセージ一覧を取得
        const messages = results.messages;
        const l = messages.length;
        for (let i = 0; i < l; i++) {
            const message = messages[i];
            const text = `${message.message}（${message.ruleId}）`;
            // 有効とされているエラーか？
            if (!isTarget(settings, message.ruleId, message.message)) {
                continue;
            }
            // エラーの文字数を取得します。
            // 文字数が存在しない場合の値は1になります。
            const posRange = message.fix?.range
                ? message.fix.range[1] - message.fix.range[0]
                : 1;
            // エラーの開始位置を取得します。
            const startPos = node_1.Position.create(Math.max(0, message.loc.start.line - 1), Math.max(0, message.loc.start.column - 1));
            // エラーの終了位置を取得します。
            const endPos = node_1.Position.create(Math.max(0, message.loc.end.line - 1), Math.max(0, message.loc.start.column - 1 + posRange));
            // 診断結果を作成
            const diagnostic = {
                severity: toDiagnosticSeverity(message.severity),
                range: node_1.Range.create(startPos, endPos),
                message: text,
                source: "テキスト校正くん",
                code: message.ruleId,
            };
            diagnostics.push(diagnostic);
        }
    }
    // 診断結果をVSCodeに送信し、ユーザーインターフェースに表示します。
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
};
/**
 * 設定で有効としているエラーかどうか判定します。
 * @param settings VSCode側の設定
 * @param targetRuleId エラーのルールID
 * @param message エラーメッセージ
 * @returns
 */
const isTarget = (settings, targetRuleId, message) => {
    let bool = false;
    rule_1.DEFAULT_EXTENSION_RULES.forEach((rule) => {
        if (targetRuleId === "prh") {
            // prhのルールの場合
            // ruleIdからprh内の細かいルールを取得できないのでmessageに含まれているか取得している
            const ruleIdSub = rule.ruleId.split("/")[1];
            if (message.includes(`（${ruleIdSub}）`)) {
                // VSCodeの設定に存在しないルールは、デフォルト設定を使用します。
                bool = settings.textlint[rule.ruleName] ?? rule.enabled;
            }
        }
        else if (rule.ruleId.includes(targetRuleId)) {
            // 使用するルールのIDとエラーのルールIDが一致する場合
            // VSCodeの設定に存在しないルールは、デフォルト設定を使用します。
            // 例: ですます調、jtf-style/1.2.2
            bool = settings.textlint[rule.ruleName] ?? rule.enabled;
        }
    });
    return bool;
};
/**
 * validate済みの内容を破棄します。
 * @param textDocument
 */
const resetTextDocument = async (textDocument) => {
    const diagnostics = [];
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
};
const toDiagnosticSeverity = (severity) => {
    switch (severity) {
        case 0:
            return node_1.DiagnosticSeverity.Information;
        case 1:
            return node_1.DiagnosticSeverity.Warning;
        case 2:
            return node_1.DiagnosticSeverity.Error;
    }
    return node_1.DiagnosticSeverity.Information;
};
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map
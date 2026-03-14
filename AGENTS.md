# STELLAProject Agent Rules

このワークスペースで作業するエージェントは、以下の規約を常に参照してください。

- `.agents/rules/general.md`
- `.agents/rules/Agents.md`
- `.agents/rules/coding-standard.md`

追加方針:

- 共通規約 `.agents/rules/coding-standard.md` を全Project共通の正規規約として扱うこと
- エラーハンドリングは文脈付きメッセージを原則とすること
- 継続可能な失敗はログを残し、失敗の黙殺を避けること
- 例外を残す場合は理由コメントを必須とすること
- `Polaris` はユーザーデータと他アプリの実ファイルへ直接触れる高リスク領域として扱うこと
- `Polaris` では規約準拠に加えて「まず理解できる設計」を優先し、難解な分岐や過剰な抽象化を避けること
- `Polaris` の変更では「他アプリを邪魔しない」「ユーザーデータを壊さない」「停止時の影響を説明できる」を最低条件として確認すること

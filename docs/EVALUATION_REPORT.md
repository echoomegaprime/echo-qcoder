# Evaluation report

The deterministic evaluator ran all 60 labelled cases in `evals/golden-prompts.json`: 10 direct, 10 indirect, 10 ambiguous, 10 negative/out-of-scope, 5 malformed/adversarial, 5 unauthorized, 5 destructive-boundary, and 5 prompt-injection cases.

| Metric              | Result |
| ------------------- | ------ |
| Activation accuracy | 1.0    |
| Tool accuracy       | 1.0    |
| Unsafe activations  | 0      |
| Mismatches          | 0      |

This evaluator validates metadata routing expectations deterministically; it is not evidence of ChatGPT host routing. Host evaluation is blocked until the production MCP route and OAuth registration exist.

import * as fs from "fs";
import * as yaml from "js-yaml";

export interface PolicyViolation {
  ruleId: string;
  severity: string;
  action: string;
  triggeredText: string;
}

interface Rule { id: string; severity: string; banned_phrases_regex?: string[] }

export class PolicyEngine {
  private config: any;
  constructor(yamlPath: string) {
    this.config = yaml.load(fs.readFileSync(yamlPath, "utf8"));
  }

  checkText(text: string, mode: "REGULAR" | "SHOPPABLE"): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const rules: Rule[] = [...(this.config.regular_live?.forbidden_behaviors || [])];
    if (mode === "SHOPPABLE") {
      rules.push(...(this.config.shoppable_live?.product_claims || []));
      rules.push(...(this.config.shoppable_live?.traffic || []));
    }
    for (const rule of rules) {
      for (const pattern of rule.banned_phrases_regex || []) {
        if (new RegExp(pattern, "i").test(text)) {
          const action = this.config.enforcement?.[rule.severity]?.action || "AUTO_SEND";
          violations.push({ ruleId: rule.id, severity: rule.severity, action, triggeredText: text });
          break;
        }
      }
    }
    return violations;
  }
}

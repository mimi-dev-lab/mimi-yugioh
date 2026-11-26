// 烙印的决策树（试用功能 tree，#52）：由 scripts/decision-tree.js 从路线数据和 docs/opening-analysis.jsonl 生成，不手改；测试核对它等于重算的结果。
// 节点 { card, yes, no }：手里有这张卡（密码）走 yes，没有走 no；叶子 { route }：路线 id。口径和生成规则见 src/tree.js 文件头。问题的措辞覆盖在 branded-tree-text.js。
export const TREE = {
  "card": 1984618,
  "yes": {
    "card": 73819701,
    "yes": {
      "route": "white-saint"
    },
    "no": {
      "route": "nadir-servant"
    }
  },
  "no": {
    "card": 55273560,
    "yes": {
      "card": 29948294,
      "yes": {
        "route": "high-spirits-albaz"
      },
      "no": {
        "route": "white-saint"
      }
    },
    "no": {
      "card": 62962630,
      "yes": {
        "card": 44362883,
        "yes": {
          "route": "branded-fusion-aluber"
        },
        "no": {
          "card": 73819701,
          "yes": {
            "route": "white-albaz"
          },
          "no": {
            "card": 42141493,
            "yes": {
              "route": "high-spirits-fuwalos"
            },
            "no": {
              "route": "aluber"
            }
          }
        }
      },
      "no": {
        "card": 73819701,
        "yes": {
          "route": "white-albaz"
        },
        "no": {
          "card": 29948294,
          "yes": {
            "card": 42141493,
            "yes": {
              "route": "high-spirits-fuwalos"
            },
            "no": {
              "card": 68468459,
              "yes": {
                "route": "high-spirits-albaz"
              },
              "no": {
                "route": "high-spirits-shrouded"
              }
            }
          },
          "no": {
            "route": "branded-fusion"
          }
        }
      }
    }
  }
};

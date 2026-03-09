Research a technical question before implementing. Use this when unsure about
library behaviour, Postgres semantics, Next.js APIs, or any runtime behaviour
that would be asserted in code or a PR description.

Given: $ARGUMENTS

Steps:
1. Search for official documentation and authoritative sources using WebSearch.
2. If the question is about Postgres, also test empirically:
   `docker compose exec -T postgres psql -U campfire -d campfire -c "<test query>"`
3. If the question is about a Node.js/npm package, check the package source or
   official changelog for the specific version in use (check package.json first).
4. Summarise findings clearly:
   - What the behaviour actually is (with source/evidence)
   - Any version differences or caveats
   - What this means for the current implementation
5. If the finding contradicts something already in the codebase or a PR comment,
   flag it explicitly.

Do not implement anything — this command is research only.

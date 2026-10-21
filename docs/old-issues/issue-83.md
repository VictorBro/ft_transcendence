# #83: feat(api): an offline lesson generator

> Text of [issue #83](https://github.com/VictorBro/ft_transcendence/issues/83) before the Milestone 2 replan (#137), saved on 2026-10-21.

this issue has to be redesigned, old content moved to:
https://github.com/VictorBro/ft_transcendence/issues/124

With limit of free Gemini API, online lesson generation will not be feasible. Only 20 requests per day allowed and Gemini blocks big requests instead of small ones.

This means, all lesson briefs and contents have to be generated offline. There are two possibilities:

1) Do all with Claude/Chat GPT (uses a lot of tokens)
2) Use jules (Gemini Flash 3.6 or Gemini Pro 3.1 in cloud). Nearly no limitations, can work hours without user on PC.

Jules is availabel to @VictorBro, @VYAntares and @bastian-schnitzler.

Either way, after defining lesson brief and lesson content schema, we need a good prompt to let thoses models run. This could be the deliverable of this issue.

needs: #77, #117 

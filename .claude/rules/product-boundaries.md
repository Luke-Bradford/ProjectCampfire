# Product Boundaries

ProjectCampfire is a private-first social planning app for friend groups who game together.

## Core MVP Value

The MVP helps users:
- add friends
- create private groups
- share availability
- schedule gaming sessions
- vote on games and times
- RSVP to sessions
- keep related discussion in one place
- view lightweight game context that supports planning

The main loop is:

1. know who is available
2. decide what to play
3. schedule the session
4. discuss the plan in one place

## MVP Scope Rules

Prioritize features that directly improve the private friend-group planning loop.

Game metadata and external integrations are supporting features, not the product core.

When evaluating a feature or implementation, prefer the option that strengthens:
- private social planning
- friend/group coordination
- scheduling clarity
- lightweight discussion tied to plans and games

## Do Not Expand MVP Into

Do not introduce or optimize for:
- public forums
- public game communities
- global social feeds
- live chat
- voice/video calling
- repost systems
- recommendation engines
- popularity dashboards as a primary feature
- complex profile showcase systems
- board game support
- moderation-heavy public interaction
- deep dependence on third-party APIs

## External Integrations

Steam, Twitch, YouTube, store/pricing sources, and other platforms may enrich the product, but the app must still provide value without them.

Do not make core user flows depend entirely on external integrations unless explicitly requested.

## Decision Rule

If a proposed feature does not directly improve the private friend-group planning loop, defer it unless explicitly approved.

If a request is ambiguous, choose the narrower interpretation that best fits the MVP.
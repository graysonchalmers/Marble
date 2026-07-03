export interface ChangelogEntry {
    version: string;
    date: string;
    changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        version: "v1.1.0",
        date: "2026-02-24",
        changes: [
            "Project Architectural Refactor (Phase 1-3)",
            "Migrated state management from React Context to Zustand for stable game loop performance",
            "Restructured project hierarchy into feature-based directories (game, ui, store, audio)",
            "Extracted all massive inline styles to semantic, performant Vanilla CSS classes",
            "Added accessible ARIA labels to Settings Menu inputs and toggles",
            "Resolved all CSS linter warnings and console errors",
        ]
    },
    {
        version: "v1.0.1",
        date: "2026-02-05",
        changes: [
            "Finalized Enemy V2 AI Finite State Machine (Idle, Search, Chase, Alert)",
            "Integrated Sonar Ping visual and audio system",
            "Added Raycast-based Line of Sight checks for Enemy V2",
            "Implemented Unified Debug Menu for performance profiling"
        ]
    },
    {
        version: "v1.0.0",
        date: "2026-02-01",
        changes: [
            "Initial Release - 'Tag!' prototype",
            "Kinematic player movement using React Three Fiber and Cannon.js",
            "Deterministic terrain generation",
            "Basic Enemy V1 AI (linear chase)",
            "Custom dark/monochrome aesthetic system"
        ]
    }
];

export const CURRENT_VERSION = CHANGELOG[0].version;

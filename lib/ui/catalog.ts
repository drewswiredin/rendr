import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

// The inline-UI vocabulary: the forms a reply can take besides prose.
// Three tiers —
//   primitives  (from @json-render/shadcn): layout and basic content
//   chat pieces (mined from json-render's chat example): metric, callout,
//               timeline, charts, inputs
//   composites  (ours): the response shapes a general assistant reaches for —
//               KeyFacts, Steps, Compare, ProsCons, Itinerary, Choices
// This file has no React dependency so the server can build the prompt.

const dataRows = z.array(z.record(z.string(), z.unknown()));

export const uiCatalog = defineCatalog(schema, {
  components: {
    // --- primitives -------------------------------------------------------
    Stack: shadcnComponentDefinitions.Stack,
    Grid: shadcnComponentDefinitions.Grid,
    Card: shadcnComponentDefinitions.Card,
    Separator: shadcnComponentDefinitions.Separator,
    Heading: shadcnComponentDefinitions.Heading,
    Badge: shadcnComponentDefinitions.Badge,
    Accordion: shadcnComponentDefinitions.Accordion,
    Table: shadcnComponentDefinitions.Table,

    Text: {
      props: z.object({
        content: z
          .string()
          .describe("Supports inline markdown (bold, links, code)"),
        muted: z.boolean().nullable(),
      }),
      description: "A paragraph of text",
      example: { content: "Rome is warmer in October than Paris." },
    },

    Link: {
      props: z.object({ text: z.string(), href: z.string() }),
      description: "External link, opens in a new tab",
    },

    // --- chat pieces -------------------------------------------------------
    Callout: {
      props: z.object({
        type: z.enum(["info", "tip", "warning", "important"]).nullable(),
        title: z.string().nullable(),
        content: z.string(),
      }),
      description:
        "Highlighted box for a key fact, tip, warning, or caveat. One or two sentences.",
      example: {
        type: "tip",
        title: "Book ahead",
        content: "The Vatican Museums sell out days in advance in October.",
      },
    },

    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
        trend: z.enum(["up", "down", "neutral"]).nullable(),
      }),
      description: "One prominent number with a label; put several in a Grid",
      example: {
        label: "Distance to the Sun",
        value: "149.6M km",
        detail: "1 AU",
        trend: null,
      },
    },

    Timeline: {
      props: z.object({
        items: z.array(
          z.object({
            title: z.string(),
            description: z.string().nullable(),
            date: z.string().nullable(),
            status: z.enum(["completed", "current", "upcoming"]).nullable(),
          }),
        ),
      }),
      description:
        "Vertical timeline of dated events or milestones (history, a project, a process over time)",
    },

    BarChart: {
      props: z.object({
        title: z.string().nullable(),
        data: dataRows,
        xKey: z.string(),
        yKey: z.string(),
        color: z.string().nullable(),
        height: z.number().nullable(),
      }),
      description:
        "Bar chart comparing values across categories. Put the rows in /state and bind data with { $state }. xKey is the category field, yKey the numeric field.",
    },

    LineChart: {
      props: z.object({
        title: z.string().nullable(),
        data: dataRows,
        xKey: z.string(),
        yKey: z.string(),
        color: z.string().nullable(),
        height: z.number().nullable(),
      }),
      description:
        "Line chart for a trend over an ordered axis (time, distance, temperature).",
    },

    PieChart: {
      props: z.object({
        title: z.string().nullable(),
        data: dataRows,
        nameKey: z.string(),
        valueKey: z.string(),
        height: z.number().nullable(),
      }),
      description:
        "Donut chart for proportions of a whole (composition, share, breakdown).",
    },

    Tabs: {
      props: z.object({
        defaultValue: z.string().nullable(),
        tabs: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
      slots: ["default"],
      description:
        "Tabbed container; children are TabContent elements, one per tab",
    },

    TabContent: {
      props: z.object({ value: z.string() }),
      slots: ["default"],
      description: "The content of one tab (value must match a Tabs entry)",
    },

    RadioGroup: {
      props: z.object({
        label: z.string().nullable(),
        value: z.string().nullable(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
      description:
        'Single-choice input. Bind with { "$bindState": "/path" } on value so the choice lands in state.',
      example: {
        label: "Travel style",
        value: { $bindState: "/style" },
        options: [
          { value: "relaxed", label: "Relaxed" },
          { value: "packed", label: "See everything" },
        ],
      },
    },

    SelectInput: {
      props: z.object({
        label: z.string().nullable(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
      description:
        'Dropdown for many options. Bind value with { "$bindState": "/path" }.',
    },

    TextInput: {
      props: z.object({
        label: z.string().nullable(),
        value: z.string().nullable(),
        placeholder: z.string().nullable(),
        type: z.enum(["text", "email", "number", "date", "url"]).nullable(),
      }),
      description:
        'Free-text input. Bind value with { "$bindState": "/path" }.',
    },

    Button: {
      props: z.object({
        label: z.string(),
        variant: z
          .enum(["default", "secondary", "outline", "ghost"])
          .nullable(),
        size: z.enum(["default", "sm", "lg"]).nullable(),
      }),
      events: ["press"],
      description:
        "Button. Use on.press with the reply action to send collected inputs back to the assistant, or setState to reveal something.",
    },

    // --- composites --------------------------------------------------------
    KeyFacts: {
      props: z.object({
        title: z.string().nullable(),
        facts: z.array(z.object({ label: z.string(), value: z.string() })),
      }),
      description:
        "Compact label/value list for the essentials of a thing (a city, a compound, a person, a product). 3-8 rows.",
      example: {
        title: "Paris at a glance",
        facts: [
          { label: "Best months", value: "May–June, Sept–Oct" },
          { label: "Currency", value: "Euro" },
        ],
      },
    },

    Steps: {
      props: z.object({
        title: z.string().nullable(),
        steps: z.array(
          z.object({ title: z.string(), detail: z.string().nullable() }),
        ),
      }),
      description:
        "Numbered sequence: how to do something, how a process unfolds, a plan of attack. Use instead of a numbered list when each step needs a title and a detail.",
      example: {
        title: "Four-stroke cycle",
        steps: [
          {
            title: "Intake",
            detail: "Piston descends, drawing in air and fuel.",
          },
          {
            title: "Compression",
            detail: "Piston rises, squeezing the mixture.",
          },
        ],
      },
    },

    Compare: {
      props: z.object({
        title: z.string().nullable(),
        options: z
          .array(z.string())
          .describe("2-4 things being compared (column headers)"),
        rows: z.array(
          z.object({
            attribute: z.string(),
            values: z.array(z.string()).describe("one per option, same order"),
          }),
        ),
        verdict: z
          .string()
          .nullable()
          .describe("one-line bottom line, optional"),
      }),
      description:
        "Side-by-side comparison of 2-4 options across attributes. The go-to shape for 'X vs Y'.",
      example: {
        title: "Paris vs Rome in October",
        options: ["Paris", "Rome"],
        rows: [
          {
            attribute: "Weather",
            values: ["9–17°C, grey spells", "13–23°C, mostly sunny"],
          },
          {
            attribute: "Food",
            values: ["Refined, pricier", "Simpler, cheaper"],
          },
        ],
        verdict: "Rome for warmth and food, Paris for museums.",
      },
    },

    ProsCons: {
      props: z.object({
        title: z.string().nullable(),
        pros: z.array(z.string()),
        cons: z.array(z.string()),
      }),
      description: "Two columns of pros and cons for one option or decision",
    },

    Itinerary: {
      props: z.object({
        title: z.string().nullable(),
        days: z.array(
          z.object({
            label: z
              .string()
              .describe("e.g. 'Day 1 — Sat 12 Oct' or just 'Day 1'"),
            theme: z.string().nullable(),
            slots: z.array(
              z.object({
                time: z
                  .string()
                  .nullable()
                  .describe("'Morning', '9:00', 'Evening'…"),
                activity: z.string(),
                note: z.string().nullable(),
              }),
            ),
          }),
        ),
      }),
      description:
        "A day-by-day plan with time slots: trips, event schedules, study plans.",
    },

    Choices: {
      props: z.object({
        prompt: z
          .string()
          .nullable()
          .describe("the question being asked, optional"),
        choices: z.array(
          z.object({
            label: z.string(),
            reply: z
              .string()
              .describe("the message sent to the assistant when chosen"),
          }),
        ),
      }),
      description:
        "Quick-reply buttons for asking the user a question with 2-5 discrete answers. Choosing one sends its reply as the user's next message. Use this instead of asking in prose when the answers are enumerable.",
      example: {
        prompt: "How do you like to travel?",
        choices: [
          { label: "Relaxed pace", reply: "Relaxed pace, please" },
          {
            label: "See everything",
            reply: "Pack it in — I want to see everything",
          },
        ],
      },
    },
  },

  actions: {
    reply: {
      params: z.object({
        text: z
          .string()
          .describe(
            "Message to send as the user. Interpolate state with ${/path}, e.g. 'Budget: ${/budget}'",
          ),
      }),
      description:
        "Send a message to the assistant on the user's behalf — the way inputs and buttons hand information back.",
    },
  },
});

export type UICatalog = typeof uiCatalog;

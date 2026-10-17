import { ApplicationCommandOptionType, type RESTPutAPIApplicationCommandsJSONBody } from "discord-api-types/v10";

export const commands: RESTPutAPIApplicationCommandsJSONBody = [
  {
    name: "identify",
    description: "Show Max a photo. He'll tell you what it is.",
    options: [
      {
        type: ApplicationCommandOptionType.Attachment,
        name: "photo",
        description: "The animal. Closer is better.",
        required: true,
      },
      {
        type: ApplicationCommandOptionType.String,
        name: "location",
        description: "Roughly where you saw it, like \"Alviso Marsh\". Optional.",
        required: false,
        max_length: 100,
      },
    ],
  },
  {
    name: "askmax",
    description: "Ask Max anything about birds and wildlife.",
    options: [
      {
        type: ApplicationCommandOptionType.String,
        name: "question",
        description: "What do you want to know?",
        required: true,
        max_length: 500,
      },
    ],
  },
];

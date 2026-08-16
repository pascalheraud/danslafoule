export interface Profile {
  uuid: string;
  name: string;
}

export interface GroupSummary {
  uuid: string;
  /** Known for a group the user created; may be null for one they only joined, until a message reveals its name. */
  name: string | null;
}

export interface Message {
  uuid: string;
  groupUuid: string;
  groupName: string;
  authorUuid: string;
  authorName: string;
  text: string;
  receivedAt: string;
}

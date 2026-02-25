export interface LotteryTemplateSettings {
    matchingTypeCode: string;
    rotationCount: number;
    totalTables: number;
    usersPerTable: number;
    castsPerRotation: number;
    allowM003EmptySeats?: boolean;
}

export interface LotteryTemplate {
    id: string; // UUID or timestamp
    name: string;
    settings: LotteryTemplateSettings;
}

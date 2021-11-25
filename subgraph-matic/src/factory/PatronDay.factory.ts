import {ethereum} from "@graphprotocol/graph-ts/index";

import {
    PatronDay
} from "../../generated/schema"

import {dayMonthYearFromEventTimestamp} from "../DateConverter";
import {ZERO} from '../constants';

export function loadOrCreateDay(date: string): PatronDay | null {
    let dayEntity: PatronDay | null = PatronDay.load(date)

    if (dayEntity === null) {
        dayEntity = new PatronDay(date)
        dayEntity.totalMarketplaceVolumeInUSD = ZERO;
        dayEntity.save();
    }

    return dayEntity;
}

export function loadDayFromEvent(event: ethereum.Event): PatronDay | null {
    let dayMonthYear = dayMonthYearFromEventTimestamp(event)

    let month = dayMonthYear.month.toString();
    let day = dayMonthYear.day.toString();
    let paddedMonth = month.length === 1 ? "0".concat(month) : month;
    let paddedDay = day.length === 1 ? "0".concat(day) : day;

    let dayId = dayMonthYear.year.toString().concat("-").concat(paddedMonth).concat("-").concat(paddedDay);

    return loadOrCreateDay(dayId)
}

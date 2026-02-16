package com.oddlink.dto;

import java.time.LocalDate;

public record DailyAccess(LocalDate date, long count) {
}

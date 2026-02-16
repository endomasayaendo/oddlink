package com.oddlink.repository;

import com.oddlink.entity.AccessLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.oddlink.dto.DailyAccess;

import java.util.List;

@Repository
public interface AccessLogRepository extends JpaRepository<AccessLog, Long> {

    @Query("SELECT new com.oddlink.dto.DailyAccess(CAST(a.accessedAt AS LocalDate), COUNT(a)) " +
           "FROM AccessLog a WHERE a.urlMapping.id = :urlMappingId " +
           "GROUP BY CAST(a.accessedAt AS LocalDate) ORDER BY CAST(a.accessedAt AS LocalDate)")
    List<DailyAccess> findDailyAccessCounts(@Param("urlMappingId") Long urlMappingId);
}

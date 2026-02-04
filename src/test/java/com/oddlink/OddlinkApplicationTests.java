package com.oddlink;

import com.oddlink.service.WordCache;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class OddlinkApplicationTests {

	@MockitoBean
	private WordCache wordCache;

	@Test
	void contextLoads() {
	}

}

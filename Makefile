.PHONY: test clean

test:
	@npm test

define release
	VERSION=`node -pe "require('./package.json').version"` && \
	NEXT_VERSION=`which semver > /dev/null 2>&1 || npm install -g semver && semver -i $(1) $$VERSION` && \
	node -e "\
		const package = require('./package.json');\
		package.version = \"$$NEXT_VERSION\";\
		require('fs').writeFileSync('./package.json', JSON.stringify(package, null, 2));" && \
	git add package.json && \
	git commit -m "Version $$NEXT_VERSION" && \
	git tag "$$NEXT_VERSION" -m "Version $$NEXT_VERSION"
endef

release-patch: test
	@$(call release,patch)

release-minor: test
	@$(call release,minor)

release-major: test
	@$(call release,major)

publish:
	git push
	git push --tags
	npm publish
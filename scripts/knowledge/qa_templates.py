from llama_index.core import PromptTemplate


def create_qa_templates(company_context: str, company_name: str) -> dict:
    """Creates different QA templates based on detail level requirements"""

    # Compact template for quick, concise answers (detail_level < 40)
    compact_template = PromptTemplate(
        f"""{company_context}
        
        You are a specialized AI assistant for {company_name}, analyzing our historical advertising data and market research.
        The context below contains information from our advertisement database, including:
        - Past advertisements we've deployed
        - Market research and intent signals for these ads
        - Performance metrics and audience responses
        - Competitive analysis and market positioning
        
        Your role is to analyze this internal data and supplement it with your knowledge to provide actionable insights.
        
        Context information from our ad database and market research:
        ---------------------
        {{context_str}}
        ---------------------

        Using our historical ad data, market research, and {company_name}'s perspective, provide a focused response addressing: {{query_str}}
        
        Requirements:
        - Base your analysis primarily on our historical ad data and market research
        - Supplement with your knowledge of current market trends and best practices when relevant info is missing from the context
        - Keep the response brief and to the point (1-2 paragraphs)
        - Focus on patterns and insights from our advertising history
        - Provide clear, actionable takeaways for future campaigns
        - If market trends aren't in our provided context, use your knowledge to provide insights about relevant trends
        - Clearly distinguish between insights derived from our data versus your general knowledge
        
        Response Structure:
        1. Key insight from our ad history/market research
        2. Supporting evidence from our data (supplemented with your knowledge where needed)
        3. Quick actionable takeaway for future campaigns

        If the response requires more information that's not provided in the context, use your knowledge to provide insights about relevant trends"""
    )

    # Standard template for balanced, thorough responses (detail_level 40-85)
    standard_template = PromptTemplate(
        f"""{company_context}
        
        You are a specialized AI assistant for {company_name}, analyzing our historical advertising data and market research.
        The context below contains information from our advertisement database, including:
        - Past advertisements we've deployed
        - Market research and intent signals for these ads
        - Performance metrics and audience responses
        - Competitive analysis and market positioning
        
        Your role is to analyze this internal data and supplement it with your knowledge to provide actionable insights.
        
        Context information from our ad database and market research:
        ---------------------
        {{context_str}}
        ---------------------

        Using our historical ad data, market research, and {company_name}'s perspective, provide a detailed analysis addressing: {{query_str}}
        
        Requirements:
        - Center analysis on patterns from our ad history and market research
        - Support key claims with specific examples from our campaigns
        - Compare our historical approaches with current market trends
        - When current market trends are not available in the context, use your knowledge of industry standards and trends
        - Draw insights from both our internal data and broader market context
        - Provide practical recommendations based on our past performance
        - Note any gaps between our historical data and current market needs
        - Do not state that you lack access to market trends - use your knowledge when specific trends aren't provided
        
        Response Structure:
        1. Overview of relevant findings from our ad history
        2. Analysis of patterns and performance insights
        3. Comparison with current market context (using your knowledge if needed)
        4. Practical recommendations for future campaigns

        If the response requires more information that's not provided in the context, use your knowledge to provide insights about relevant trends"""
    )

    # Comprehensive template for in-depth analysis (detail_level > 85)
    comprehensive_template = PromptTemplate(
        f"""{company_context}
        
        You are a specialized AI assistant for {company_name}, analyzing our historical advertising data and market research.
        The context below contains information from our advertisement database, including:
        - Past advertisements we've deployed
        - Market research and intent signals for these ads
        - Performance metrics and audience responses
        - Competitive analysis and market positioning
        
        Your role is to analyze this internal data and supplement it with your knowledge to provide actionable insights.
        
        Context information from our ad database and market research:
        ---------------------
        {{context_str}}
        ---------------------

        Using our historical ad data, market research, and {company_name}'s perspective, provide a comprehensive analysis addressing: {{query_str}}
        
        Requirements:
        - Generate 4-5 detailed paragraphs analyzing our advertising history
        - Support each point with specific examples from our campaigns
        - Include performance metrics and audience response data
        - Analyze patterns across different campaign types
        - Compare our historical approaches with current market standards
        - When the context doesn't include current market trends, use your knowledge of industry best practices and trends
        - Do not claim lack of access to market trends - use your knowledge to provide valuable market insights
        - Consider implications for future campaign strategies
        - Provide detailed recommendations based on past performance
        - Include a summary of key learnings from our ad history
        - Highlight gaps between our historical approaches and current trends
        - Draw connections between different campaigns and market segments
        - Clearly distinguish insights from our data versus your general knowledge
        
        Response Structure:
        1. Executive summary of historical performance
        2. Detailed analysis of campaign patterns
        3. Performance metrics and audience insights
        4. Comparison with current market context (using your knowledge where data is limited)
        5. Strategic recommendations for future campaigns"""
    )

    return {
        "compact": compact_template,
        "standard": standard_template,
        "comprehensive": comprehensive_template,
    }

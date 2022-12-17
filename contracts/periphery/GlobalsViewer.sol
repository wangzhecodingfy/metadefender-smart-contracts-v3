//SPDX-License-Identifier:ISC
pragma solidity 0.8.9;

import "../interfaces/IMetaDefender.sol";
import "../interfaces/IAmericanBinaryOptions.sol";
import "../interfaces/IPolicy.sol";
import "../interfaces/IMetaDefenderMarketsRegistry.sol";

import "../Lib/SafeDecimalMath.sol";

// console
import "hardhat/console.sol";

/**
 * @title OptionMarketViewer
 * @author MetaDefender
 * @dev Provides helpful functions to allow the dapp to operate more smoothly;
 */
contract GlobalsViewer {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct TradeInsuranceView {
        uint premium;
        uint fee;
        uint newRisk;
    }

    struct GlobalsView {
        uint totalValidCertificateLiquidity;
        uint totalPendingCertificateLiquidity;
        uint totalCoverage;
        uint totalPendingCoverage;
    }

    IMetaDefender internal metaDefender;
    IAmericanBinaryOptions internal americanBinaryOptions;
    ILiquidityCertificate internal liquidityCertificate;
    IMetaDefenderMarketsRegistry internal metaDefenderMarketsRegistry;
    IPolicy internal policy;

    bool public initialized = false;

    constructor() {}

    /**
     * @dev Initializes the contract
   * @param _americanBinaryOptions AmericanBinaryOptions contract address
   */
    function init(
        IMetaDefenderMarketsRegistry _metaDefenderMarketsRegistry,
        IAmericanBinaryOptions _americanBinaryOptions
    ) external {
        require(!initialized, "Contract already initialized");
        metaDefenderMarketsRegistry = _metaDefenderMarketsRegistry;
        americanBinaryOptions = _americanBinaryOptions;
        initialized = true;
    }

    /**
     * @dev Gets the premium from the AmericanBinaryOptions contract and calculates the fee.
   */
    function getPremium(uint coverage, uint duration, address _metaDefender) public view returns (TradeInsuranceView memory) {
        IMetaDefender.GlobalInfo memory globalInfo = IMetaDefender(_metaDefender).getGlobalInfo();
        uint newRisk = globalInfo.risk.add(coverage.divideDecimal(globalInfo.standardRisk));
        int premium = americanBinaryOptions.americanBinaryOptionPrices(duration * 1 days, globalInfo.risk, 1000e18, 1500e18, 6e16);
        if (premium < 0) {
            premium = 0;
        }
        return TradeInsuranceView(uint(premium), 10e18, newRisk);
    }

    function getGlobals() public view returns (GlobalsView memory) {
        address[] memory markets = metaDefenderMarketsRegistry.getInsuranceMarkets();
        IMetaDefenderMarketsRegistry.MarketAddresses[] memory marketAddresses = metaDefenderMarketsRegistry.getInsuranceMarketsAddresses(markets);
        uint totalValidCertificateLiquidityInAll = 0;
        uint totalPendingCertificateLiquidityInAll = 0;
        uint totalCoverageInAll = 0;
        uint totalPendingCoverageInAll = 0;
        for (uint i = 0; i < marketAddresses.length; i++) {
            totalValidCertificateLiquidityInAll = totalValidCertificateLiquidityInAll.add(ILiquidityCertificate(marketAddresses[i].liquidityCertificate).totalValidCertificateLiquidity());
            totalPendingCertificateLiquidityInAll = totalPendingCertificateLiquidityInAll.add(ILiquidityCertificate(marketAddresses[i].liquidityCertificate).totalPendingCertificateLiquidity());
            totalCoverageInAll = totalCoverageInAll.add(IPolicy(marketAddresses[i].policy).totalCoverage());
            totalPendingCoverageInAll = totalPendingCoverageInAll.add(IPolicy(marketAddresses[i].policy).totalPendingCoverage());
        }
        return GlobalsView(totalValidCertificateLiquidityInAll, totalPendingCertificateLiquidityInAll, totalCoverageInAll, totalPendingCoverageInAll);
    }
}
